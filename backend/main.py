import asyncio
import json
import os
import secrets
import tempfile
import time
import uuid
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Request, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

# Import our modules
from database import DatabaseManager
from text_pipeline import process_document
from document_store import save_document, list_documents, delete_document, get_stats, get_chunks_for_scan, get_chunks_with_embeddings, DB_PATH
from embedding_pipeline import encode_chunks, find_matches, extract_top_similar_sentences
from faiss_index import invalidate_cached_index
from diff_checker import compute_comparison
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

_CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Components
db = DatabaseManager()

# ==================== SSE JOB STORES ====================
JOB_TTL = int(os.getenv("JOB_TTL", "600"))
jobs: dict = {}              # job_id -> {"queue": asyncio.Queue, "created_at": float}
analysis_results: dict = {}  # job_id -> {"data": dict, "created_at": float}


def _cleanup_stale_entries():
    """Remove job queues and results older than JOB_TTL to prevent memory leaks."""
    now = time.time()
    for k in [k for k, v in jobs.items() if now - v.get("created_at", 0) > JOB_TTL]:
        jobs.pop(k, None)
    for k in [k for k, v in analysis_results.items() if now - v.get("created_at", 0) > JOB_TTL]:
        analysis_results.pop(k, None)


# ==================== SESSION / AUTH ====================
SESSION_TTL = int(os.getenv("SESSION_TTL", "86400"))
_sessions: dict = {}


def _create_session(user: dict) -> str:
    token = secrets.token_urlsafe(32)
    _sessions[token] = {"user": user, "created_at": time.time()}
    return token


def _get_session_user(request: Request):
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header[7:]
    session = _sessions.get(token)
    if not session:
        return None
    if time.time() - session["created_at"] > SESSION_TTL:
        _sessions.pop(token, None)
        return None
    return session["user"]


def require_auth(request: Request) -> dict:
    user = _get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required. Please login first.")
    return user


def require_admin(request: Request) -> dict:
    user = require_auth(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")
    return user


# ==================== RATE LIMITING ====================
_rate_limits: dict = defaultdict(list)
RATE_LIMIT_ANALYZE = int(os.getenv("RATE_LIMIT_ANALYZE", "10"))
RATE_WINDOW = 60


def _check_rate_limit(request: Request, limit: int = None):
    if limit is None:
        limit = RATE_LIMIT_ANALYZE
    client_ip = request.client.host if request.client else "unknown"
    now = time.time()
    _rate_limits[client_ip] = [t for t in _rate_limits[client_ip] if now - t < RATE_WINDOW]
    if len(_rate_limits[client_ip]) >= limit:
        raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")
    _rate_limits[client_ip].append(now)


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


# ==================== AUTH ENDPOINTS ====================

@app.post("/auth/login")
def login(req: LoginRequest):
    user = db.authenticate_user(req.email, req.password, req.role)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password for this role.")
    token = _create_session(user)
    return {"success": True, "user": user, "token": token}

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
def get_users(current_user: dict = Depends(require_admin)):
    users = db.get_all_users(exclude_admins=True)
    return {"users": users}

@app.post("/auth/users/teacher")
def add_teacher(req: AddTeacherRequest, current_user: dict = Depends(require_admin)):
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
def delete_user(user_id: int, current_user: dict = Depends(require_admin)):
    success = db.delete_user(user_id)
    if not success:
        raise HTTPException(status_code=404, detail="User not found or cannot be deleted.")
    return {"success": True}


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
    invalidate_cached_index(repo_type, owner_id)
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
    await queue.put({"progress": progress, "stage": stage})
    await asyncio.sleep(0.3)


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
    entry = jobs.get(job_id)
    queue = entry.get("queue") if entry else None
    if queue is None:
        return

    try:
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

        if meta.num_pages_or_slides > 250:
            warning_msg = (
                f"This document has {meta.num_pages_or_slides} pages which exceeds "
                f"the 250-page limit. It cannot be added to the repository or scanned. "
                f"Please upload a document with 250 pages or fewer."
            )
            await queue.put({"progress": 100, "stage": "Done", "warning": warning_msg})
            analysis_results[job_id] = {"data": {
                "warning": warning_msg,
                "page_or_slide_count": meta.num_pages_or_slides,
                "filename": original_filename,
                "overall_similarity": 0.0,
                "matches": [],
                "top_similar_sentences": [],
            }, "created_at": time.time()}
            return

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
            BATCH_SIZE = 64
            embeddings_arr = []
            for i in range(0, len(chunks), BATCH_SIZE):
                batch = chunks[i:i + BATCH_SIZE]
                batch_emb = await asyncio.to_thread(encode_chunks, batch)
                embeddings_arr.extend(batch_emb)
            import numpy as np
            embeddings_arr = np.array(embeddings_arr)
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
            await asyncio.to_thread(invalidate_cached_index, repo_type, owner_id_val)

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
                highlighted_pdf_url = f"/artifacts/{artifact_name}"

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
        analysis_results[job_id] = {"data": result, "created_at": time.time()}

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
    request: Request,
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
    _check_rate_limit(request)
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

    _cleanup_stale_entries()
    job_id = str(uuid.uuid4())
    jobs[job_id] = {"queue": asyncio.Queue(), "created_at": time.time()}

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
    entry = jobs.get(job_id)
    queue = entry.get("queue") if entry else None
    if queue is None:
        raise HTTPException(status_code=404, detail="Job not found.")

    async def event_generator():
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=300.0)
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
    Fetch the stored result for a completed job.
    Results are kept for JOB_TTL seconds and cleaned up automatically.
    """
    entry = analysis_results.get(job_id)
    if entry is None or "data" not in entry:
        raise HTTPException(status_code=404, detail="Result not found. Job may not be complete yet.")
    return entry["data"]


@app.post("/analyze/report")
async def generate_report(request: Request):
    """
    Generate a Turnitin-style similarity report PDF and return it as a download.
    Body: same JSON payload as the analysis result.
    """
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


# ==================== DOCUMENT COMPARISON (SSE + Background Task) ====================

async def _run_comparison(
    job_id: str,
    source_path: str,
    target_path: str,
    source_filename: str,
    target_filename: str,
):
    """Background task: compare two PDFs, highlight extra text in yellow."""
    entry = jobs.get(job_id)
    queue = entry.get("queue") if entry else None
    if queue is None:
        return

    try:
        await _push(queue, 10, "Reading documents\u2026")
        await _push(queue, 30, "Extracting text\u2026")
        await _push(queue, 50, "Comparing documents\u2026")

        safe_name = "".join(
            ch if ch.isalnum() or ch in ("-", "_", ".") else "_"
            for ch in target_filename
        )
        artifact_name = f"cmp_{job_id[:8]}_{safe_name}"
        artifact_path = os.path.join(ARTIFACTS_DIR, artifact_name)

        result = await asyncio.to_thread(
            compute_comparison, source_path, target_path, artifact_path
        )

        await _push(queue, 80, "Generating highlights\u2026")

        highlighted_pdf_url = f"/artifacts/{artifact_name}"

        await _push(queue, 95, "Finalising\u2026")

        # Build highlight_summary.located_sentences in the same format
        # as the plagiarism check pipeline so PdfViewer renders identically.
        raw_highlights = result.get("frontend_highlights") or []
        located_sentences = []
        for hl in raw_highlights:
            located_sentences.append({
                "page_number": hl["page_number"],
                "regions": hl["regions"],
                "bbox": hl["regions"][0] if hl["regions"] else [0, 0, 0, 0],
                "match_index": 8,
                "match_indices": [8],
                "matched_file_names": [],
            })

        final = {
            "overall_similarity": result["similarity_score"],
            "extra_percentage": result["extra_percentage"],
            "total_words": result["total_words"],
            "extra_word_count": result["extra_word_count"],
            "common_word_count": result["common_word_count"],
            "semantic_similarity": 0,
            "lexical_similarity": 0,
            "fingerprint_similarity": 0,
            "matches": [],
            "top_similar_sentences": [],
            "highlighted_pdf_url": highlighted_pdf_url,
            "highlight_summary": {
                "located_sentence_count": len(located_sentences),
                "highlight_count": result["highlight_count"],
                "located_sentences": located_sentences,
            },
            "filename": target_filename,
            "source_filename": source_filename,
            "source_text": result.get("suspect_text", ""),
            "page_or_slide_count": result.get("suspect_pages", 0),
            "chunk_count": 0,
            "highlight_count": result["highlight_count"],
            "extra_snippets": result.get("extra_snippets", []),
            "metadata": {
                "file_name": target_filename,
                "source_file_name": source_filename,
                "document_id": f"comparison-{job_id[:8]}",
                "file_type": "pdf",
                "num_pages_or_slides": result.get("suspect_pages", 0),
            },
            "is_comparison": True,
        }
        analysis_results[job_id] = {"data": final, "created_at": time.time()}
        await queue.put({"progress": 100, "stage": "Done"})

    except Exception as e:
        await queue.put({"error": str(e)})
    finally:
        for p in (source_path, target_path):
            try:
                os.unlink(p)
            except OSError:
                pass


@app.post("/compare")
async def compare_documents(
    request: Request,
    background_tasks: BackgroundTasks,
    source_file: UploadFile = File(...),
    target_file: UploadFile = File(...),
):
    """Compare two PDF documents. Returns job_id for SSE progress tracking."""
    _check_rate_limit(request)

    source_ext = os.path.splitext(source_file.filename or "")[1].lower()
    target_ext = os.path.splitext(target_file.filename or "")[1].lower()
    if source_ext != ".pdf" or target_ext != ".pdf":
        raise HTTPException(status_code=400, detail="Both files must be PDF.")

    source_content = await source_file.read()
    target_content = await target_file.read()

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_s:
        tmp_s.write(source_content)
        source_path = tmp_s.name
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_t:
        tmp_t.write(target_content)
        target_path = tmp_t.name

    _cleanup_stale_entries()
    job_id = str(uuid.uuid4())
    jobs[job_id] = {"queue": asyncio.Queue(), "created_at": time.time()}

    background_tasks.add_task(
        _run_comparison,
        job_id=job_id,
        source_path=source_path,
        target_path=target_path,
        source_filename=source_file.filename or "source.pdf",
        target_filename=target_file.filename or "suspect.pdf",
    )

    return {"job_id": job_id}


@app.post("/compare/report")
async def generate_comparison_report_endpoint(request: Request):
    """Generate a comparison report PDF and return it as a download."""
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    from report_generator import generate_comparison_report

    report_filename = f"comparison_report_{uuid.uuid4().hex[:8]}.pdf"
    output_path = os.path.join(ARTIFACTS_DIR, report_filename)

    try:
        await asyncio.to_thread(generate_comparison_report, data, output_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Report generation failed: {e}")

    return FileResponse(
        output_path,
        media_type="application/pdf",
        filename=f"Comparison_Report_{data.get('filename', 'document')}.pdf",
        headers={"Content-Disposition": f"attachment; filename=\"Comparison_Report.pdf\""},
    )


@app.on_event("startup")
def _startup_cleanup():
    """Remove artifacts older than 1 hour on startup."""
    cutoff = time.time() - 3600
    if os.path.isdir(ARTIFACTS_DIR):
        for name in os.listdir(ARTIFACTS_DIR):
            path = os.path.join(ARTIFACTS_DIR, name)
            try:
                if os.path.isfile(path) and os.path.getmtime(path) < cutoff:
                    os.unlink(path)
            except OSError:
                pass


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8000")),
    )