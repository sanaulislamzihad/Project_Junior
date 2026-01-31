from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import shutil
import os
import glob
from pydantic import BaseModel
from typing import List, Dict

# Import our modules
from pdf_processor import extract_text_from_pdf
from similarity_engine import calculate_similarity_score, find_highlighting_matches, normalize_text

app = FastAPI(title="NSU PDF Similarity Checker")

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all for dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

REPO_PATH = "../nsu_repository"
os.makedirs(REPO_PATH, exist_ok=True)

class MatchResult(BaseModel):
    filename: str
    similarity_score: float
    matched_segments: List[Dict]

class AnalysisResponse(BaseModel):
    source_filename: str
    overall_similarity: float
    matches: List[MatchResult]

@app.get("/")
def health_check():
    return {"status": "active", "repository_path": os.path.abspath(REPO_PATH)}

@app.get("/repository")
def list_repository():
    """Lists all PDF files in the NSU repository."""
    files = glob.glob(os.path.join(REPO_PATH, "*.pdf"))
    return {"count": len(files), "files": [os.path.basename(f) for f in files]}

@app.post("/analyze")
async def analyze_document(file: UploadFile = File(...)):
    """
    Analyzes the uploaded PDF against the repository.
    """
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    # 1. Save uploaded file temporarily to extract text
    temp_path = f"temp_{file.filename}"
    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    try:
        source_text = extract_text_from_pdf(temp_path)
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

    if not source_text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from the PDF. It might be empty or scanned.")

    # 2. Load Repository Docs
    repo_files = glob.glob(os.path.join(REPO_PATH, "*.pdf"))
    if not repo_files:
        return {
            "source_filename": file.filename,
            "overall_similarity": 0.0,
            "matches": [],
            "message": "Repository is empty."
        }

    repo_texts = []
    valid_repo_files = []

    # Optimization: In a real app, we would cache these texts
    for repo_file in repo_files:
        text = extract_text_from_pdf(repo_file)
        if text.strip():
            repo_texts.append(text)
            valid_repo_files.append(os.path.basename(repo_file))

    if not repo_texts:
         return {
            "source_filename": file.filename,
            "overall_similarity": 0.0,
            "matches": [],
            "message": "No valid text found in repository files."
        }

    # 3. Calculate Similarity
    # Normalize text for comparison by replacing newlines with spaces (1-to-1 mapping)
    # This keeps indices valid for the original source_text while allowing "sentence detection" across line breaks.
    flat_source = source_text.replace('\n', ' ').replace('\r', ' ')
    
    # We also need to flatten repo texts for comparison
    flat_repo_texts = [t.replace('\n', ' ').replace('\r', ' ') for t in repo_texts]

    # This gives us a vector of scores corresponding to repo_texts
    scores = calculate_similarity_score(flat_source, flat_repo_texts)

    results = []
    max_score = 0.0

    for idx, score in enumerate(scores):
        if score > 0.0: # Filter out zero matches
            # Find specific highlighted segments uses the FLATTENED text for matching logic
            segments = find_highlighting_matches(flat_source, flat_repo_texts[idx])
            
            # Recalculate Score based on Text Coverage (Visual Similarity)
            # This ensures the percentage matches the highlighted amount
            matched_len = sum(s['end'] - s['start'] for s in segments)
            coverage_percent = 0.0
            if len(source_text) > 0:
                coverage_percent = round((matched_len / len(source_text)) * 100, 2)
            
            # Use the coverage percent as the reported score
            sim_percent = coverage_percent

            if sim_percent > max_score:
                max_score = sim_percent

            results.append({
                "filename": valid_repo_files[idx],
                "similarity_score": sim_percent,
                "matched_segments": segments
            })

    # Sort checks by score descending
    results.sort(key=lambda x: x["similarity_score"], reverse=True)

    return {
        "source_filename": file.filename,
        "overall_similarity": max_score, # Highest single document match, or could be cumulative
        "matches": results,
        "source_text": source_text # Return full text for the UI to highlight
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
