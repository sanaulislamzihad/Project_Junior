import os
import tempfile
import uuid
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

# Import our modules
from database import DatabaseManager
from text_pipeline import process_document
from document_store import save_document, list_documents, delete_document, get_stats, get_chunks_for_scan, get_chunks_with_embeddings, DB_PATH
from embedding_pipeline import encode_chunks, find_matches, extract_top_similar_sentences
from diff_checker import compute_diff
from pdf_highlight_pipeline import highlight_pdf_matches

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
    return FileResponse(artifact_path, media_type="application/pdf", filename=safe_name)


@app.get("/documents/stats")
def documents_stats():
    """Check how many documents/chunks are saved in documents.db (same DB used for uploads)."""
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
    """Get chunks for similarity scan. repo_type: 'university' | 'personal' | 'both'. For personal/both, pass owner_id=teacher user id."""
    if repo_type not in ("university", "personal", "both"):
        raise HTTPException(status_code=400, detail="repo_type must be 'university', 'personal', or 'both'.")
    if repo_type in ("personal", "both") and owner_id is None:
        raise HTTPException(status_code=400, detail="owner_id required for personal or both repository.")
    chunks = get_chunks_for_scan(repo_type=repo_type, owner_id=owner_id)
    return {"repo_type": repo_type, "owner_id": owner_id, "chunk_count": len(chunks), "chunks": chunks}


# ==================== DOCUMENT ANALYSIS (Text Processing Pipeline) ====================

ALLOWED_EXTENSIONS = {".pdf", ".pptx"}

@app.post("/analyze")
async def analyze_document(
    file: UploadFile = File(...),
    repo_type: str = Form("university"),
    user_id: str = Form(""),
    role: str = Form("teacher"),
    add_to_repo: str = Form("true"),
    filename_override: str = Form(""),
):
    """Extract text from PDF/PPTX, clean, chunk. add_to_repo=true: save to DB; add_to_repo=false: check-only, no save."""
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Only PDF and PPTX files are supported.")
    repo_type = (repo_type or "university").lower()
    if repo_type not in ("university", "personal", "both"):
        raise HTTPException(status_code=400, detail="repo_type must be 'university', 'personal', or 'both'.")
    will_save = add_to_repo.lower() in ("true", "1", "yes")
    if will_save:
        # Prevent saving to 'both' repository since it's only meant for checking
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
        owner_id_val = None
        if repo_type in ("personal", "both"):
            raise HTTPException(status_code=400, detail="user_id must be a number.")
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name
        try:
            pdf_method = "pymupdf" if ext == ".pdf" else "pdfplumber"
            chunks, meta, cleaned_text = process_document(
                tmp_path,
                pdf_method=pdf_method,
                chunk_strategy="words",
                max_chunk_size=250,
                overlap=60,
            )
            original_filename = (filename_override and filename_override.strip()) or file.filename or meta.file_name
            file_path_stored = f"uploaded/{original_filename}"
            meta_dict = meta.to_dict()
            if will_save:
                embeddings_arr = encode_chunks(chunks)
                embeddings_blobs = [arr.tobytes() for arr in embeddings_arr]
                save_document(
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
            meta_dict["file_path"] = file_path_stored
            meta_dict["repo_type"] = repo_type
            meta_dict["owner_id"] = owner_id_val

            semantic_similarity, lexical_similarity, fingerprint_similarity, overall_similarity, matches = 0.0, 0.0, 0.0, 0.0, []
            top_similar_sentences = []
            highlighted_pdf_url = None
            highlight_summary = None
            if not will_save and chunks:
                repo_chunks = get_chunks_with_embeddings(repo_type=repo_type, owner_id=owner_id_val)
                semantic_similarity, lexical_similarity, fingerprint_similarity, overall_similarity, matches = find_matches(
                    chunks, repo_chunks, repo_type=repo_type, owner_id=owner_id_val
                )
                top_similar_sentences = extract_top_similar_sentences(matches)
                if ext == ".pdf":
                    safe_base_name = "".join(ch if ch.isalnum() or ch in ("-", "_", ".") else "_" for ch in original_filename)
                    artifact_name = f"{meta.document_id}_{uuid.uuid4().hex[:8]}_{safe_base_name}"
                    artifact_path = os.path.join(ARTIFACTS_DIR, artifact_name)
                    highlight_summary = highlight_pdf_matches(tmp_path, matches, artifact_path)
                    highlighted_pdf_url = f"http://localhost:8000/artifacts/{artifact_name}"
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
        return {
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
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process file: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
