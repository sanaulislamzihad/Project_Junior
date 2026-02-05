from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import shutil
import os
import glob
from pydantic import BaseModel
from typing import List, Dict
import difflib

# Import our modules
from pdf_processor import extract_text_from_pdf, extract_text_from_pptx, validate_file
from database import DatabaseManager
from vector_engine import VectorEngine

app = FastAPI(title="NSU PlagiChecker RAG")

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

REPO_PATH = "../nsu_repository"
os.makedirs(REPO_PATH, exist_ok=True)

# Initialize RAG Components
print("Initializing RAG System...")
db = DatabaseManager()
vector_engine = VectorEngine(db)

# --- Startup: Index New Files ---
@app.on_event("startup")
async def startup_event():
    print("Scanning repository for new files...")
    all_files = glob.glob(os.path.join(REPO_PATH, "*.*"))
    
    for file_path in all_files:
        filename = os.path.basename(file_path)
        if not validate_file(filename):
            continue
            
        # Check if already indexed
        if db.get_doc_id(filename) is None:
            print(f"Indexing new file: {filename}")
            
            # Extract
            text = ""
            if filename.lower().endswith(".pdf"):
                text = extract_text_from_pdf(file_path)
            elif filename.lower().endswith(".pptx"):
                text = extract_text_from_pptx(file_path)
            
            if text.strip():
                # Index (Chunk -> Embed -> FAISS)
                vector_engine.process_and_index_document(filename, text)
            else:
                print(f"Skipping empty file: {filename}")
    print("Startup index scan complete.")

class MatchSegment(BaseModel):
    text: str
    start: int
    end: int
    source_match_start: int = 0 # Legacy field for frontend compat

class MatchResult(BaseModel):
    filename: str
    similarity_score: float
    matched_segments: List[MatchSegment]

class AnalysisResponse(BaseModel):
    source_filename: str
    overall_similarity: float
    matches: List[MatchResult]
    source_text: str

@app.get("/")
def health_check():
    return {"status": "active", "mode": "RAG-Vector-Search"}

@app.get("/repository")
def list_repository():
    files = glob.glob(os.path.join(REPO_PATH, "*.*"))
    return {"count": len(files), "files": [os.path.basename(f) for f in files if validate_file(f)]}

@app.post("/analyze")
async def analyze_document(file: UploadFile = File(...)):
    if not validate_file(file.filename):
        raise HTTPException(status_code=400, detail="Only PDF and PPTX files are allowed")

    # 1. Save and Extract
    temp_path = f"temp_{file.filename}"
    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    try:
        source_text = ""
        if file.filename.lower().endswith(".pdf"):
            source_text = extract_text_from_pdf(temp_path)
        elif file.filename.lower().endswith(".pptx"):
            source_text = extract_text_from_pptx(temp_path)
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

    if not source_text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text.")

    # 2. RAG Search
    # Search for chunks similar to the input text
    # We set a threshold for similarity (e.g. 0.5 cosine sim ~ 50%)
    matches_raw = vector_engine.search(source_text, top_k=5, threshold=0.5)

    # 3. Aggregate Results per Document
    # We need to map individual chunk matches back to document-level scores.
    # Logic: Score = (Total unique matched length / Source length) * 100
    
    # --- Context Expansion ---
    # Fetch neighbors (prev/next chunks) to ensure we don't miss split sentences.
    expanded_matches = []
    processed_chunks = set() # (doc_id, chunk_idx)

    for match in matches_raw:
        doc_id = match['match_doc_id']
        c_idx = match['chunk_index']
        
        # Add original match
        if (doc_id, c_idx) not in processed_chunks:
            expanded_matches.append(match)
            processed_chunks.add((doc_id, c_idx))
        
        # Add Neighbors
        for offset in [-1, 1]:
            neighbor_idx = c_idx + offset
            if (doc_id, neighbor_idx) not in processed_chunks:
                # Fetch text from DB
                n_text = db.get_chunk_text_by_index(doc_id, neighbor_idx)
                if n_text:
                    expanded_matches.append({
                        'filename': match['filename'],
                        'chunk_text': n_text,
                        'score': match['score'] # Inherit score (or slightly lower)
                    })
                    processed_chunks.add((doc_id, neighbor_idx))

    doc_hits = {} # filename -> list of matched_query_segments
    
    for match in expanded_matches:
        fname = match['filename']
        if fname not in doc_hits:
            doc_hits[fname] = []
        
        doc_hits[fname].append({
            "text": match['chunk_text'],
            "score": match['score']
        })

    results = []
    max_score = 0.0

    # Convert to frontend format
    for fname, hits in doc_hits.items():
        # Dedup hits
        unique_hits = {h['text']: h for h in hits}.values()
        
        # Approximate score: Average vector similarity of top chunks? 
        # Or Coverage? Let's use Coverage-ish: sum(len(chunks))/len(source)
        # Bounded by 100.
        matched_len = sum(len(h['text']) for h in unique_hits)
        coverage_score = min(100.0, (matched_len / len(source_text)) * 100) if source_text else 0
        
        # Frontend expects 'matched_segments' with start/end relative to SOURCE.
        # Since we did RAG search, we found *similar repository content*.
        # To highlight SOURCE, we search for that repository content IN the source text.
    
        segments = []
        
        # We want to find where the Repo Text (hits) appears in Source Text.
        # Since RAG is semantic, the text might not be identical. 
        # We use SequenceMatcher to find the "matching blocks" (the identical parts).
        
        for hit in unique_hits:
            repo_chunk_text = hit['text']
            
            # We start looking for matches. 
            # Note: strict matching against the *entire* source text can be slow if source is huge.
            # But for 5-10 pages it's fine.
            matcher = difflib.SequenceMatcher(None, source_text, repo_chunk_text, autojunk=False)
            
            for match in matcher.get_matching_blocks():
                # match is a named tuple: (a=start in source, b=start in repo, size=length)
                enc_a, enc_b, size = match
                
                # Filter out noise (e.g. single words or " the ")
                if size > 45: 
                    segments.append({
                        "text": source_text[enc_a : enc_a + size],
                        "start": enc_a,
                        "end": enc_a + size,
                        "source_match_start": enc_b # where it started in the repo chunk
                    })
        
        # Dedup segments (remove wholly contained sub-segments) to avoid double highlighting
        # Sorting by start index
        segments.sort(key=lambda x: x['start'])
        
        merged_segments = []
        if segments:
            current = segments[0]
            for next_seg in segments[1:]:
                if next_seg['start'] < current['end']:
                    # Overlap: Extend current end if needed
                    current['end'] = max(current['end'], next_seg['end'])
                    # Update text to match new range
                    current['text'] = source_text[current['start']:current['end']]
                else:
                    merged_segments.append(current)
                    current = next_seg
            merged_segments.append(current)

        if merged_segments:
            # Recalculate coverage based on the ACTUAL highlighted parts
            total_matched_len = sum(s['end'] - s['start'] for s in merged_segments)
            coverage_score = min(100.0, (total_matched_len / len(source_text)) * 100) if source_text else 0

            if coverage_score > max_score:
                max_score = coverage_score
                
            results.append({
                "filename": fname,
                "similarity_score": round(coverage_score, 2),
                "matched_segments": merged_segments
            })

    results.sort(key=lambda x: x["similarity_score"], reverse=True)

    return {
        "source_filename": file.filename,
        "overall_similarity": round(max_score, 2),
        "matches": results,
        "source_text": source_text
    }

@app.post("/compare")
async def compare_documents(
    source_file: UploadFile = File(...),
    target_file: UploadFile = File(...)
):
    if not validate_file(source_file.filename) or not validate_file(target_file.filename):
        raise HTTPException(status_code=400, detail="Only PDF and PPTX files are allowed")

    # Helper to save and extract
    def process_upload(upload_file):
        temp_path = f"temp_{upload_file.filename}"
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(upload_file.file, buffer)
        try:
            if upload_file.filename.lower().endswith(".pdf"):
                return extract_text_from_pdf(temp_path)
            elif upload_file.filename.lower().endswith(".pptx"):
                return extract_text_from_pptx(temp_path)
            return ""
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

    text_a = process_upload(source_file)
    text_b = process_upload(target_file)

    if not text_a.strip() or not text_b.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from one or both files.")

    # Compare A (Source) vs B (Target/Suspect)
    # We want to find parts of B that are in A.
    matcher = difflib.SequenceMatcher(None, text_a, text_b, autojunk=False)
    
    matches = []
    total_match_len = 0
    
    for match in matcher.get_matching_blocks():
        a_start, b_start, size = match
        if size > 45: # Threshold
            matches.append({
                "text": text_a[a_start:a_start+size], # Text from Source
                "source_start": a_start,
                "source_end": a_start + size,
                "target_start": b_start,
                "target_end": b_start + size
            })
            total_match_len += size

    # Coverage score relative to Target (how much of Target is copied from Source?)
    score = 0.0
    if len(text_b) > 0:
        score = min(100.0, (total_match_len / len(text_b)) * 100)

    return {
        "source_filename": source_file.filename,
        "target_filename": target_file.filename,
        "similarity_score": round(score, 2),
        "matches": matches,
        "source_text": text_a,
        "target_text": text_b
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
