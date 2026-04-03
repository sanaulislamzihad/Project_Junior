import asyncio
import json
import os
import tempfile
import uuid
from datetime import datetime, timezone

from fastapi import BackgroundTasks, FastAPI, HTTPException, Request, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

# Import our modules
from database import DatabaseManager
from text_pipeline import process_document
from document_store import save_document, list_documents, delete_document, get_stats, get_chunks_for_scan, get_chunks_with_embeddings, DB_PATH
from embedding_pipeline import encode_chunks, find_matches, extract_top_similar_sentences
from diff_checker import compute_diff
from pdf_highlight_pipeline import highlight_pdf_matches
from report_generator import generate_turnitin_report


def group_matches_by_source(raw_matches: list) -> list:
    """
    Turnitin-style: group all chunk-level matches from the same source document
    into a single match record. Merges sentence-level evidence, deduplicates,
    and computes aggregate similarity scores.
    """
    from collections import defaultdict
    grouped = defaultdict(lambda: {
        "file_name": None,
        "matched_document_id": None,
        "chunk_matches": [],
        "all_sentences": [],
        "all_common_portions": [],
    })

    for m in raw_matches:
        doc_id = m.get("matched_document_id") or m.get("file_name") or "unknown"
        g = grouped[doc_id]
        g["file_name"] = m.get("file_name") or doc_id
        g["matched_document_id"] = doc_id
        g["chunk_matches"].append(m)

        # Collect sentence-level evidence, deduplicate by query_sentence
        seen_q = {s["query_sentence"] for s in g["all_sentences"]}
        for s in (m.get("similar_sentences") or []):
            if s.get("query_sentence") and s["query_sentence"] not in seen_q:
                g["all_sentences"].append(s)
                seen_q.add(s["query_sentence"])

        # Collect common text portions
        for cp in (m.get("common_portions") or []):
            if cp not in g["all_common_portions"]:
                g["all_common_portions"].append(cp)

    result = []
    for doc_id, g in grouped.items():
        chunks = g["chunk_matches"]
        n = len(chunks)
        if n == 0:
            continue
        avg_sem = sum(c.get("semantic_similarity", 0) for c in chunks) / n
        avg_lex = sum(c.get("lexical_similarity", 0) for c in chunks) / n
        avg_fp  = sum(c.get("fingerprint_similarity", 0) for c in chunks) / n
        avg_comb= sum(c.get("combined_similarity", 0) for c in chunks) / n

        # Sort sentences by semantic score descending
        sentences = sorted(
            g["all_sentences"],
            key=lambda s: s.get("semantic_similarity", 0),
            reverse=True
        )[:20]  # cap at 20 sentences per source

        result.append({
            "file_name": g["file_name"],
            "matched_document_id": doc_id,
            "semantic_similarity": round(avg_sem, 4),
            "lexical_similarity": round(avg_lex, 4),
            "fingerprint_similarity": round(avg_fp, 4),
            "combined_similarity": round(avg_comb, 4),
            "matched_chunks_count": n,
            "similar_sentences": sentences,
            "common_portions": g["all_common_portions"][:10],
        })

    # Sort by combined similarity descending
    result.sort(key=lambda x: x["combined_similarity"], reverse=True)
    return result

app = FastAPI(title="NSU PlagiChecker Auth")

ARTIFACTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "artifacts")
os.makedirs(ARTIFACTS_DIR, exist_ok=True)

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Components
db = DatabaseManager()

# ==================== SSE JOB STORES ====================
# Each job_id maps to its own asyncio.Queue.
# Concurrent jobs NEVER share state — no clashing possible.
jobs: dict = {}              # job_id -> asyncio.Queue
analysis_results: dict = {}  # job_id -> final result dict

# ==================== AUTH MODELS ====================

class LoginRequest(BaseModel):
    email: str
    password: str
    role: str

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    nsu_id: str = None

class AddTeacherRequest(BaseModel):
    name: str
    email: str
    password: str


class DiffCompareRequest(BaseModel):
    text_a: str
    text_b: str
    context_lines: int = 2

# ==================== AUTH ENDPOINTS ====================

@app.post("/auth/login")
def login(req: LoginRequest):
    user = db.authenticate_user(req.email, req.password, req.role)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password for this role.")
    return {"success": True, "user": user}

@app.post("/auth/register")
def register(req: RegisterRequest):
    if db.email_exists(req.email):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    user = db.add_user(
        name=req.name,
        email=req.email,
        password=req.password,
        role="student",
        nsu_id=req.nsu_id
    )
    if not user:
        raise HTTPException(status_code=409, detail="Registration failed.")
    return {"success": True, "user": user}

@app.get("/auth/users")
def get_users():
    users = db.get_all_users(exclude_admins=True)
    return {"users": users}

@app.post("/auth/users/teacher")
def add_teacher(req: AddTeacherRequest):
    if db.email_exists(req.email):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    user = db.add_user(
        name=req.name,
        email=req.email,
        password=req.password,
        role="teacher"
    )
    if not user:
        raise HTTPException(status_code=500, detail="Failed to add teacher.")
    return {"success": True, "user": user}

@app.delete("/auth/users/{user_id}")
def delete_user(user_id: int):
    success = db.delete_user(user_id)
    if not success:
        raise HTTPException(status_code=404, detail="User not found or cannot be deleted.")
    return {"success": True}


@app.post("/diff/compare")
def diff_compare(req: DiffCompareRequest):
    if not req.text_a and not req.text_b:
        raise HTTPException(status_code=400, detail="At least one text input is required.")
    return compute_diff(req.text_a or "", req.text_b or "", context_lines=req.context_lines)

@app.get("/")
def health_check():
    return {"status": "active", "mode": "Auth-Only-Backend"}


@app.get("/artifacts/{artifact_name}")
def get_artifact(artifact_name: str):
    safe_name = os.path.basename(artifact_name)
    artifact_path = os.path.join(ARTIFACTS_DIR, safe_name)
    if not os.path.isfile(artifact_path):
        raise HTTPException(status_code=404, detail="Artifact not found.")
    return FileResponse(
        artifact_path,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{safe_name}"'},
    )


@app.get("/documents/stats")
def documents_stats():
    """Check how many documents/chunks are saved in documents.db."""
    stats = get_stats()
    if stats is None:
        return {"error": "documents.db not found or no tables", "db_path": DB_PATH}
    return stats


@app.get("/documents/list")
def documents_list(repo_type: str = "university", owner_id: int = None):
    """List documents. admin: repo_type=university; teacher: repo_type=personal, owner_id=teacher_id."""
    if repo_type not in ("university", "personal"):
        raise HTTPException(status_code=400, detail="repo_type must be 'university' or 'personal'.")
    if repo_type == "personal" and owner_id is None:
        raise HTTPException(status_code=400, detail="owner_id required for personal repository.")
    docs = list_documents(repo_type=repo_type, owner_id=owner_id)
    return {"documents": docs}


@app.delete("/documents/{document_id}")
def documents_delete(document_id: str, repo_type: str = "university", owner_id: int = None):
    """Delete a document. Admin: university docs; Teacher: own personal docs only."""
    docs = list_documents(repo_type=repo_type, owner_id=owner_id)
    doc_ids = {d["document_id"] for d in docs}
    if document_id not in doc_ids:
        raise HTTPException(status_code=404, detail="Document not found or access denied.")
    success = delete_document(document_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete document.")
    return {"success": True}


@app.get("/documents/scan")
def documents_scan(repo_type: str = "university", owner_id: int = None):
    """Get chunks for similarity scan."""
    if repo_type not in ("university", "personal", "both"):
        raise HTTPException(status_code=400, detail="repo_type must be 'university', 'personal', or 'both'.")
    if repo_type in ("personal", "both") and owner_id is None:
        raise HTTPException(status_code=400, detail="owner_id required for personal or both repository.")
    chunks = get_chunks_for_scan(repo_type=repo_type, owner_id=owner_id)
    return {"repo_type": repo_type, "owner_id": owner_id, "chunk_count": len(chunks), "chunks": chunks}


# ==================== DOCUMENT ANALYSIS (SSE + Background Task) ====================

ALLOWED_EXTENSIONS = {".pdf", ".pptx"}


async def _push(queue, progress: int, stage: str):
    """Push a progress event then pause briefly so UX is visible."""
    await queue.put({"progress": progress, "stage": stage})
    await asyncio.sleep(0.8)


async def _run_analysis(
    job_id: str,
    tmp_path: str,
    ext: str,
    will_save: bool,
    repo_type: str,
    owner_id_val,
    original_filename: str,
    file_path_stored: str,
    role: str,
):
    """
    Background task: runs the full analysis pipeline.
    Every blocking call is wrapped in asyncio.to_thread() so concurrent
    uploads never starve each other's SSE streams (no clashing).
    """
    queue = jobs.get(job_id)
    if queue is None:
        return

    try:
        # Stage 1 — Extract & chunk text
        await _push(queue, 10, "Extracting text\u2026")
        pdf_method = "pymupdf" if ext == ".pdf" else "pdfplumber"
        chunks, meta, cleaned_text = await asyncio.to_thread(
            process_document,
            tmp_path,
            pdf_method=pdf_method,
            chunk_strategy="words",
            max_chunk_size=150,
            overlap=20,
        )

        await _push(queue, 25, "Chunking complete\u2026")

        meta_dict = meta.to_dict()
        meta_dict["file_path"] = file_path_stored
        meta_dict["repo_type"] = repo_type
        meta_dict["owner_id"] = owner_id_val

        semantic_similarity = 0.0
        lexical_similarity = 0.0
        fingerprint_similarity = 0.0
        overall_similarity = 0.0
        matches = []
        top_similar_sentences = []
        highlighted_pdf_url = None
        highlight_summary = None

        if will_save:
            # Stage 2 — Encode embeddings + save to repo
            await _push(queue, 45, "Computing embeddings\u2026")
            embeddings_arr = await asyncio.to_thread(encode_chunks, chunks)
            embeddings_blobs = [arr.tobytes() for arr in embeddings_arr]

            await _push(queue, 70, "Saving to repository\u2026")
            await asyncio.to_thread(
                save_document,
                document_id=meta.document_id,
                file_name=original_filename,
                file_path=file_path_stored,
                num_chunks=meta.num_chunks,
                indexing_time=meta.indexing_time,
                file_type=meta.file_type,
                num_pages_or_slides=meta.num_pages_or_slides,
                raw_text_length=meta.raw_text_length,
                chunks=chunks,
                repo_type=repo_type,
                owner_id=owner_id_val,
                embeddings=embeddings_blobs,
            )
            meta_dict["indexed_at"] = datetime.now(timezone.utc).isoformat()

        elif chunks:
            # Stage 2 — Similarity scan
            await _push(queue, 45, "Computing embeddings\u2026")
            repo_chunks = await asyncio.to_thread(
                get_chunks_with_embeddings, repo_type=repo_type, owner_id=owner_id_val
            )

            await _push(queue, 60, "Scanning repository\u2026")
            (
                semantic_similarity,
                lexical_similarity,
                fingerprint_similarity,
                overall_similarity,
                matches,
            ) = await asyncio.to_thread(
                find_matches,
                chunks,
                repo_chunks,
                repo_type=repo_type,
                owner_id=owner_id_val,
            )

            await _push(queue, 75, "Ranking matches\u2026")
            # Group chunk-level matches by source document (Turnitin style: one card per source)
            matches = group_matches_by_source(matches)
            top_similar_sentences = await asyncio.to_thread(
                extract_top_similar_sentences, matches
            )

            if ext == ".pdf":
                await _push(queue, 85, "Generating highlights\u2026")
                safe_base_name = "".join(
                    ch if ch.isalnum() or ch in ("-", "_", ".") else "_"
                    for ch in original_filename
                )
                artifact_name = f"{meta.document_id}_{uuid.uuid4().hex[:8]}_{safe_base_name}"
                artifact_path = os.path.join(ARTIFACTS_DIR, artifact_name)
                highlight_summary = await asyncio.to_thread(
                    highlight_pdf_matches, tmp_path, matches, artifact_path
                )
                highlighted_pdf_url = f"http://localhost:8000/artifacts/{artifact_name}"

        # Stage final — Finalise
        await _push(queue, 95, "Finalising report\u2026")

        result = {
            "source_text": cleaned_text,
            "overall_similarity": overall_similarity,
            "semantic_similarity": semantic_similarity,
            "lexical_similarity": lexical_similarity,
            "fingerprint_similarity": fingerprint_similarity,
            "matches": matches,
            "top_similar_sentences": top_similar_sentences,
            "highlighted_pdf_url": highlighted_pdf_url,
            "highlight_summary": highlight_summary,
            "filename": original_filename,
            "page_or_slide_count": meta.num_pages_or_slides,
            "chunk_count": meta.num_chunks,
            "metadata": {**meta_dict, "file_name": original_filename},
        }
        analysis_results[job_id] = result

        # Signal completion — frontend will fetch result via GET
        await queue.put({"progress": 100, "stage": "Done"})

    except Exception as e:
        await queue.put({"error": str(e)})
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


@app.post("/analyze")
async def analyze_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    repo_type: str = Form("university"),
    user_id: str = Form(""),
    role: str = Form("teacher"),
    add_to_repo: str = Form("true"),
    filename_override: str = Form(""),
):
    """
    Kick off an analysis job and return {job_id} immediately.
    The client opens GET /analyze/stream/{job_id} for real-time progress,
    then GET /analyze/result/{job_id} to retrieve the final report.
    """
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Only PDF and PPTX files are supported.")

    repo_type = (repo_type or "university").lower()
    if repo_type not in ("university", "personal", "both"):
        raise HTTPException(status_code=400, detail="repo_type must be 'university', 'personal', or 'both'.")

    will_save = add_to_repo.lower() in ("true", "1", "yes")
    if will_save:
        if repo_type == "both":
            raise HTTPException(status_code=400, detail="Cannot save to 'both' repos at once. Choose one.")
        if repo_type == "university" and role != "admin":
            raise HTTPException(status_code=403, detail="Only admin can upload to Whole University repository.")
        if repo_type == "personal":
            if role != "teacher":
                raise HTTPException(status_code=403, detail="Only teacher can upload to Personal repository.")
            if not user_id or not user_id.strip():
                raise HTTPException(status_code=400, detail="user_id required for personal repository.")

    try:
        owner_id_val = int(user_id.strip()) if repo_type in ("personal", "both") and user_id and user_id.strip() else None
    except ValueError:
        if repo_type in ("personal", "both"):
            raise HTTPException(status_code=400, detail="user_id must be a number.")
        owner_id_val = None

    # Read the upload into a temp file NOW so the file handle stays valid in the background task
    content = await file.read()
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    original_filename = (filename_override and filename_override.strip()) or file.filename or ""
    file_path_stored = f"uploaded/{original_filename}"

    # Each upload gets its own isolated queue — concurrent jobs never clash
    job_id = str(uuid.uuid4())
    jobs[job_id] = asyncio.Queue()

    background_tasks.add_task(
        _run_analysis,
        job_id=job_id,
        tmp_path=tmp_path,
        ext=ext,
        will_save=will_save,
        repo_type=repo_type,
        owner_id_val=owner_id_val,
        original_filename=original_filename,
        file_path_stored=file_path_stored,
        role=role,
    )

    return {"job_id": job_id}


@app.get("/analyze/stream/{job_id}")
async def analyze_stream(job_id: str):
    """
    SSE stream for a running analysis job.
    Yields {progress, stage} JSON objects until done or error.
    Each job has its OWN queue — concurrent uploads never interfere.
    """
    queue = jobs.get(job_id)
    if queue is None:
        raise HTTPException(status_code=404, detail="Job not found.")

    async def event_generator():
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=120.0)
            except asyncio.TimeoutError:
                yield {"event": "error", "data": json.dumps({"error": "Job timed out."})}
                break

            if "error" in event:
                yield {"event": "error", "data": json.dumps(event)}
                break

            yield {"data": json.dumps(event)}

            if event.get("progress") == 100 and event.get("stage") == "Done":
                break

        # Cleanup job queue after streaming ends
        jobs.pop(job_id, None)

    return EventSourceResponse(event_generator())


@app.get("/analyze/result/{job_id}")
async def analyze_result(job_id: str):
    """
    Fetch the stored result for a completed job, then clean it up.
    """
    result = analysis_results.pop(job_id, None)
    if result is None:
        raise HTTPException(status_code=404, detail="Result not found. Job may not be complete yet.")
    return result


@app.post("/analyze/report")
async def generate_report(request: Request):
    """
    Generate a Turnitin-style similarity report PDF and return it as a download.
    Body: same JSON payload as the analysis result.
    """
    import uuid, tempfile
    from fastapi.responses import FileResponse

    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    report_filename = f"similarity_report_{uuid.uuid4().hex[:8]}.pdf"
    artifacts_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "artifacts")
    os.makedirs(artifacts_dir, exist_ok=True)
    output_path = os.path.join(artifacts_dir, report_filename)

    try:
        await asyncio.to_thread(generate_turnitin_report, data, output_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Report generation failed: {e}")

    return FileResponse(
        output_path,
        media_type="application/pdf",
        filename=f"Similarity_Report_{data.get('filename', 'document')}.pdf",
        headers={"Content-Disposition": f"attachment; filename=\"Similarity_Report.pdf\""}
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)