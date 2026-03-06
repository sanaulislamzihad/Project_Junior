# paraphrase-MiniLM-L6-v2 Integration – Changes Summary

## Overview
AI model **paraphrase-MiniLM-L6-v2** integrate kora hoyeche PlagiChecker e semantic similarity (paraphrase detection) er jonno.

---

## New Files

### 1. `backend/embedding_pipeline.py`
- **Model:** `paraphrase-MiniLM-L6-v2` (sentence-transformers)
- **Functions:**
  - `encode_chunks(chunks)` – text chunks theke embeddings generate kore
  - `cosine_similarity(a, b)` – 2 ta vector er similarity
  - `find_matches(query_chunks, repo_chunks, threshold=0.5)` – repo er sathe semantic match khuje

---

## Modified Files

### 2. `backend/document_store.py`
- **New table:** `document_chunk_embeddings` (document_id, chunk_index, embedding BLOB)
- **`save_document()`** – abar `embeddings` parameter (list of bytes) add, embeddings save kore
- **`get_chunks_with_embeddings()`** – chunks + embeddings return kore semantic scan er jonno
- **`delete_document()`** – embeddings table theke o delete kore

### 3. `backend/main.py`
- **Add to repo (will_save=true):**
  - Chunks theke embeddings generate (`encode_chunks`)
  - Embeddings save kore `save_document` e patha hoy
- **Check document (will_save=false):**
  - Repo theke chunks + embeddings load kore (`get_chunks_with_embeddings`)
  - `find_matches()` diye semantic similarity calculate kore
  - Response e `overall_similarity` (0–100) ar `matches` (matched chunks list) add hoy

### 4. `backend/requirements.txt`
- Already ache: `sentence-transformers`, `faiss-cpu`, `numpy`

---

## Flow

1. **Document upload (Add to repo):**  
   Chunks → embeddings (paraphrase-MiniLM-L6-v2) → SQLite te save

2. **Check document:**  
   Query chunks → embeddings → repo embeddings er sathe cosine similarity → match list

3. **Threshold:**  
   Similarity ≥ 0.5 hole match hisebe count hoy (change korte `find_matches(..., threshold=0.5)` use koro)

---

## First Run

Prothom run e model download hobe (~80MB). Internet connection lagbe.
