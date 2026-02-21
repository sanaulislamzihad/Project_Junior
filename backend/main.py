import os
import tempfile
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Import our modules
from database import DatabaseManager
from text_pipeline import process_document
from document_store import save_document, list_documents, delete_document, get_stats, get_chunks_for_scan, get_chunks_with_embeddings, DB_PATH
from embedding_pipeline import encode_chunks, find_matches

app = FastAPI(title="NSU PlagiChecker Auth")

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

@app.get("/")
def health_check():
    return {"status": "active", "mode": "Auth-Only-Backend"}


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
    """Get chunks for similarity scan. repo_type: 'university' (whole university) | 'personal' (teacher repo). For personal, pass owner_id=teacher user id."""
    if repo_type not in ("university", "personal"):
        raise HTTPException(status_code=400, detail="repo_type must be 'university' or 'personal'.")
    if repo_type == "personal" and owner_id is None:
        raise HTTPException(status_code=400, detail="owner_id required for personal repository.")
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
    if repo_type not in ("university", "personal"):
        raise HTTPException(status_code=400, detail="repo_type must be 'university' or 'personal'.")
    will_save = add_to_repo.lower() in ("true", "1", "yes")
    if will_save:
        if repo_type == "university" and role != "admin":
            raise HTTPException(status_code=403, detail="Only admin can upload to Whole University repository.")
        if repo_type == "personal":
            if role != "teacher":
                raise HTTPException(status_code=403, detail="Only teacher can upload to Personal repository.")
            if not user_id or not user_id.strip():
                raise HTTPException(status_code=400, detail="user_id required for personal repository.")
    try:
        owner_id_val = int(user_id.strip()) if repo_type == "personal" and user_id and user_id.strip() else None
    except ValueError:
        owner_id_val = None
        if repo_type == "personal":
            raise HTTPException(status_code=400, detail="user_id must be a number.")
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name
        try:
            chunks, meta, cleaned_text = process_document(
                tmp_path,
                pdf_method="pdfplumber",
                chunk_strategy="words",
                max_chunk_size=200,
                overlap=20,
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

            semantic_similarity, lexical_similarity, matches = 0.0, 0.0, []
            if not will_save and chunks:
                repo_chunks = get_chunks_with_embeddings(repo_type=repo_type, owner_id=owner_id_val)
                semantic_similarity, lexical_similarity, matches = find_matches(chunks, repo_chunks, threshold=0.5)
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
        return {
            "source_text": cleaned_text,
            "overall_similarity": semantic_similarity,
            "semantic_similarity": semantic_similarity,
            "lexical_similarity": lexical_similarity,
            "matches": matches,
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
