# embedding_pipeline.py
# Semantic similarity via sentence-transformers/all-mpnet-base-v2; lexical via Jaccard.
# FAISS vector indexing is used when the repository is large for efficient similarity search.

import os
# For fixed model cache path so model is not re-downloaded on every backend restart.
import re
# Used for tokenization (word extraction) in lexical similarity.
from typing import List, Optional
# List and Optional for type hints in function signatures.
import numpy as np
# For embedding arrays and cosine similarity computation.

# Fixed cache folder inside project: model is saved here and reused on next backend run (no re-download).
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_CACHE_DIR = os.path.join(_THIS_DIR, "model_cache")

# Optional import of FAISS index module; if missing or FAISS not installed, we use brute-force only.
try:
    import faiss_index as _faiss_mod
    faiss = getattr(_faiss_mod, "faiss", None)
    build_index_from_chunks = getattr(_faiss_mod, "build_index_from_chunks", None)
    search_faiss = getattr(_faiss_mod, "search_faiss", None)
    load_index_from_disk = getattr(_faiss_mod, "load_index_from_disk", None)
    save_index_to_disk = getattr(_faiss_mod, "save_index_to_disk", None)
    FAISS_MIN_CHUNKS = getattr(_faiss_mod, "FAISS_MIN_CHUNKS", 999999)
    DEFAULT_TOP_K = getattr(_faiss_mod, "DEFAULT_TOP_K", 10)
except Exception:
    faiss = None
    build_index_from_chunks = None
    search_faiss = None
    load_index_from_disk = None
    save_index_to_disk = None
    FAISS_MIN_CHUNKS = 999999
    DEFAULT_TOP_K = 10

_MODEL = None
# Global lazy-loaded sentence transformer model (single instance for all requests).


def _tokenize(text: str) -> set:
    # Lowercase text and extract words (alphanumeric); return as set for Jaccard similarity.
    if not text:
        return set()
    return set(re.findall(r"\w+", text.lower()))


def lexical_similarity(text_a: str, text_b: str) -> float:
    # Compute Jaccard similarity between two texts using word sets; returns value in [0, 1].
    a, b = _tokenize(text_a), _tokenize(text_b)
    if not a or not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    return inter / union if union > 0 else 0.0


# Model: sentence-transformers/all-mpnet-base-v2 (768 dim, strong MTEB performance).
EMBEDDING_MODEL = "sentence-transformers/all-mpnet-base-v2"
# Embedding dimension for all-mpnet-base-v2 is 768; used for empty-array shape and filtering old embeddings.
DEFAULT_EMBEDDING_DIM = 768


def _get_model():
    # Lazy-load the sentence transformer model on first use; use fixed cache so restart does not re-download.
    global _MODEL
    if _MODEL is None:
        from sentence_transformers import SentenceTransformer
        os.makedirs(MODEL_CACHE_DIR, exist_ok=True)
        _MODEL = SentenceTransformer(EMBEDDING_MODEL, cache_folder=MODEL_CACHE_DIR)
    return _MODEL


def get_embedding_dim() -> int:
    # Return the embedding dimension of the current model (e.g. 768 for all-mpnet-base-v2).
    return _get_model().get_sentence_embedding_dimension()


def encode_chunks(chunks: List[str]) -> np.ndarray:
    # Encode a list of text chunks to embedding vectors; returns array of shape (n_chunks, dim), float32.
    if not chunks:
        return np.array([]).reshape(0, DEFAULT_EMBEDDING_DIM)
    model = _get_model()
    embeddings = model.encode(chunks, convert_to_numpy=True)
    return np.asarray(embeddings, dtype=np.float32)


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    # Compute cosine similarity between two vectors; used in brute-force comparison path.
    a = np.asarray(a, dtype=np.float32).flatten()
    b = np.asarray(b, dtype=np.float32).flatten()
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def _filter_chunks_by_embedding_dim(repo_chunks: List[dict], dim: int) -> List[dict]:
    # Keep only chunks whose embedding size matches current model (e.g. 1024 floats = 4096 bytes); skip old 384-dim.
    byte_len = dim * 4
    return [rc for rc in repo_chunks if rc.get("embedding") is not None and len(rc["embedding"]) == byte_len]


# Semantic threshold: 0.65 so real matches show (was 0.78 and caused 0% match).
DEFAULT_SEMANTIC_THRESHOLD = 0.65
# Minimum lexical overlap to show match; 12% so sentence-level overlap counts.
DEFAULT_MIN_LEXICAL = 0.12


def find_matches(
    query_chunks: List[str],
    repo_chunks: List[dict],
    threshold: float = None,
    repo_type: Optional[str] = None,
    owner_id: Optional[int] = None,
    min_lexical: float = None,
) -> tuple:
    # Compare each query chunk to repository; use FAISS when repo is large, else brute-force. Returns (sem_%, lex_%, matches).
    if threshold is None:
        threshold = DEFAULT_SEMANTIC_THRESHOLD
    if min_lexical is None:
        min_lexical = DEFAULT_MIN_LEXICAL
    if not query_chunks or not repo_chunks:
        return 0.0, 0.0, []

    # Use only repo chunks whose embedding dimension matches current model (skip old model embeddings).
    dim = get_embedding_dim()
    repo_chunks = _filter_chunks_by_embedding_dim(repo_chunks, dim)
    if not repo_chunks:
        return 0.0, 0.0, []

    # Decide whether to use FAISS: repo must have at least FAISS_MIN_CHUNKS and faiss_index must be available.
    use_faiss = (
        faiss is not None
        and build_index_from_chunks is not None
        and search_faiss is not None
        and len(repo_chunks) >= FAISS_MIN_CHUNKS
    )
    if use_faiss:
        # Try to load cached index from disk (avoids rebuilding from DB on every request).
        index, chunk_infos = load_index_from_disk(repo_type, owner_id) if load_index_from_disk else (None, [])
        if index is None or not chunk_infos:
            # Build index in memory from current repo_chunks and optionally save to disk for next time.
            index, chunk_infos = build_index_from_chunks(repo_chunks)
            if index is not None and chunk_infos and save_index_to_disk and repo_type is not None:
                save_index_to_disk(repo_type, owner_id, index, chunk_infos)
        if index is not None and chunk_infos:
            # Encode query chunks once and run FAISS Top-K search for all of them.
            query_embeddings = encode_chunks(query_chunks)
            faiss_results = search_faiss(index, chunk_infos, query_embeddings, k=DEFAULT_TOP_K)
            matches = []
            total_sem = 0.0
            total_lex = 0.0
            matched_count = 0
            for qi, row in enumerate(faiss_results):
                # Take best match only if above semantic threshold and minimum lexical overlap.
                if not row or row[0][1] < threshold:
                    continue
                chunk_info, best_sem = row[0]
                q_text = query_chunks[qi]
                best_lex = lexical_similarity(q_text, chunk_info.get("chunk_text") or "")
                if best_lex < min_lexical:
                    continue
                matches.append({
                    "query_chunk_index": qi,
                    "query_text_preview": q_text[:200] + ("..." if len(q_text) > 200 else ""),
                    "matched_document_id": chunk_info["document_id"],
                    "file_name": chunk_info.get("file_name", chunk_info["document_id"]),
                    "matched_chunk_index": chunk_info["chunk_index"],
                    "matched_text_preview": (chunk_info.get("chunk_text") or "")[:200] + ("..." if len(chunk_info.get("chunk_text") or "") > 200 else ""),
                    "semantic_similarity": round(float(best_sem), 4),
                    "lexical_similarity": round(float(best_lex), 4),
                })
                total_sem += best_sem
                total_lex += best_lex
                matched_count += 1
            sem_overall = (total_sem / len(query_chunks)) * 100 if matched_count else 0.0
            lex_overall = (total_lex / len(query_chunks)) * 100 if matched_count else 0.0
            return round(sem_overall, 2), round(lex_overall, 2), matches

    # Brute-force path: compare each query chunk to every repo chunk (used when FAISS not available or repo small).
    query_embeddings = encode_chunks(query_chunks)
    matches = []
    total_sem = 0.0
    total_lex = 0.0
    matched_count = 0
    for qi, q_emb in enumerate(query_embeddings):
        best_sem = 0.0
        best_lex = 0.0
        best_match = None
        q_text = query_chunks[qi]
        for rc in repo_chunks:
            if "embedding" not in rc or rc["embedding"] is None:
                continue
            sem = cosine_similarity(q_emb, np.frombuffer(rc["embedding"], dtype=np.float32))
            lex = lexical_similarity(q_text, rc["chunk_text"])
            if sem >= threshold and sem > best_sem and lex >= min_lexical:
                best_sem = sem
                best_lex = lex
                best_match = {
                    "query_chunk_index": qi,
                    "query_text_preview": q_text[:200] + ("..." if len(q_text) > 200 else ""),
                    "matched_document_id": rc["document_id"],
                    "file_name": rc.get("file_name", rc["document_id"]),
                    "matched_chunk_index": rc["chunk_index"],
                    "matched_text_preview": (rc["chunk_text"] or "")[:200] + ("..." if len(rc.get("chunk_text") or "") > 200 else ""),
                    "semantic_similarity": round(float(best_sem), 4),
                    "lexical_similarity": round(float(best_lex), 4),
                }
        if best_match:
            matches.append(best_match)
            total_sem += best_sem
            total_lex += best_lex
            matched_count += 1
    sem_overall = (total_sem / len(query_chunks)) * 100 if matched_count else 0.0
    lex_overall = (total_lex / len(query_chunks)) * 100 if matched_count else 0.0
    return round(sem_overall, 2), round(lex_overall, 2), matches
