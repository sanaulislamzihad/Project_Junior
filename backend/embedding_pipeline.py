# embedding_pipeline.py
# Semantic similarity via sentence-transformers/all-mpnet-base-v2; lexical via Jaccard.
# FAISS vector indexing is used when the repository is large for efficient similarity search.

import hashlib
import os
# For fixed model cache path so model is not re-downloaded on every backend restart.
import re
from difflib import SequenceMatcher
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


def _char_ngrams(text: str, n: int = 5) -> set:
    # Character n-gram fingerprint for lightweight lexical verification.
    if not text:
        return set()
    compact = re.sub(r"\s+", " ", text.strip().lower())
    if len(compact) < n:
        return {compact} if compact else set()
    return {compact[i:i + n] for i in range(0, len(compact) - n + 1)}


def _hash_ngrams(ngrams: set) -> set:
    # Hash n-grams to compact fixed-length fingerprints.
    if not ngrams:
        return set()
    return {hashlib.sha1(g.encode("utf-8")).hexdigest()[:16] for g in ngrams}


def fingerprint_similarity(text_a: str, text_b: str, n: int = 5) -> float:
    # N-gram fingerprint Jaccard similarity in [0, 1].
    fp_a = _hash_ngrams(_char_ngrams(text_a, n=n))
    fp_b = _hash_ngrams(_char_ngrams(text_b, n=n))
    if not fp_a or not fp_b:
        return 0.0
    inter = len(fp_a & fp_b)
    union = len(fp_a | fp_b)
    return inter / union if union > 0 else 0.0


def _split_sentences(text: str) -> List[str]:
    # Basic sentence segmentation for detailed match explanation.
    if not text:
        return []
    cleaned = re.sub(r"\s+", " ", text).strip()
    if not cleaned:
        return []
    parts = re.split(r"(?<=[.!?])\s+", cleaned)
    return [p.strip() for p in parts if p and len(p.strip()) >= 20]


def _extract_common_portions(text_a: str, text_b: str, min_chars: int = 18, top_n: int = 3) -> List[str]:
    # Return longest exact common text spans between two chunks.
    if not text_a or not text_b:
        return []
    sm = SequenceMatcher(a=text_a, b=text_b, autojunk=False)
    blocks = sorted(sm.get_matching_blocks(), key=lambda b: b.size, reverse=True)
    portions = []
    for block in blocks:
        if block.size < min_chars:
            continue
        span = text_a[block.a:block.a + block.size].strip()
        if not span:
            continue
        if span in portions:
            continue
        portions.append(span[:180] + ("..." if len(span) > 180 else ""))
        if len(portions) >= top_n:
            break
    return portions


def _sentence_level_matches(query_text: str, matched_text: str, min_semantic: float, min_lexical: float) -> List[dict]:
    # Find sentence-to-sentence matches to explain why a chunk matched.
    q_sentences = _split_sentences(query_text)
    m_sentences = _split_sentences(matched_text)
    if not q_sentences or not m_sentences:
        return []

    q_emb = encode_chunks(q_sentences)
    m_emb = encode_chunks(m_sentences)
    if len(q_emb) == 0 or len(m_emb) == 0:
        return []

    matches = []
    for i, q_vec in enumerate(q_emb):
        best = None
        for j, m_vec in enumerate(m_emb):
            sem = cosine_similarity(q_vec, m_vec)
            lex = lexical_similarity(q_sentences[i], m_sentences[j])
            if sem < min_semantic or lex < min_lexical:
                continue
            score = (0.8 * sem) + (0.2 * lex)
            if best is None or score > best["score"]:
                best = {
                    "query_sentence": q_sentences[i],
                    "matched_sentence": m_sentences[j],
                    "semantic_similarity": round(float(sem), 4),
                    "lexical_similarity": round(float(lex), 4),
                    "score": score,
                }
        if best is not None:
            matches.append(best)

    matches.sort(key=lambda x: x["score"], reverse=True)
    for item in matches:
        item.pop("score", None)
    return matches


def _build_match_record(
    query_chunk_index: int,
    query_text: str,
    doc_id: str,
    file_name: str,
    matched_chunk_index: int,
    matched_text: str,
    sem: float,
    lex: float,
    fp: float,
) -> Optional[dict]:
    sentence_matches = _sentence_level_matches(
        query_text,
        matched_text,
        min_semantic=DEFAULT_SENTENCE_SEMANTIC,
        min_lexical=DEFAULT_SENTENCE_LEXICAL,
    )
    common_portions = _extract_common_portions(query_text, matched_text)
    # Reject non-explainable matches: must show sentence or exact common portion evidence.
    if not sentence_matches and not common_portions:
        return None

    combined = (0.70 * sem) + (0.20 * lex) + (0.10 * fp)
    return {
        "query_chunk_index": query_chunk_index,
        "query_text_preview": query_text[:200] + ("..." if len(query_text) > 200 else ""),
        "matched_document_id": doc_id,
        "file_name": file_name,
        "matched_chunk_index": matched_chunk_index,
        "matched_text_preview": matched_text[:200] + ("..." if len(matched_text) > 200 else ""),
        "semantic_similarity": round(float(sem), 4),
        "lexical_similarity": round(float(lex), 4),
        "fingerprint_similarity": round(float(fp), 4),
        "combined_similarity": round(float(combined), 4),
        "similar_sentences": sentence_matches,
        "common_portions": common_portions,
    }


def extract_top_similar_sentences(matches: List[dict], limit: Optional[int] = None) -> List[dict]:
    # Build a global sentence list across all matched chunks.
    if not matches:
        return []

    rows = []
    seen = set()
    for m in matches:
        file_name = m.get("file_name")
        sem_chunk = float(m.get("semantic_similarity") or 0.0)
        lex_chunk = float(m.get("lexical_similarity") or 0.0)
        for sm in (m.get("similar_sentences") or []):
            q = (sm.get("query_sentence") or "").strip()
            r = (sm.get("matched_sentence") or "").strip()
            if not q or not r:
                continue
            key = (q.lower(), r.lower(), str(file_name or ""))
            if key in seen:
                continue
            seen.add(key)
            sem = float(sm.get("semantic_similarity") or 0.0)
            lex = float(sm.get("lexical_similarity") or 0.0)
            # Sentence score is primary, chunk score is weak tie-breaker.
            score = (0.75 * sem) + (0.20 * lex) + (0.05 * ((sem_chunk + lex_chunk) / 2.0))
            rows.append(
                {
                    "your_text": q,
                    "repo_text": r,
                    "file_name": file_name,
                    "semantic_similarity": round(sem, 4),
                    "lexical_similarity": round(lex, 4),
                    "score": score,
                }
            )

    rows.sort(key=lambda x: x["score"], reverse=True)
    if limit is None:
        top = rows
    else:
        top = rows[: max(0, int(limit))]
    for item in top:
        item.pop("score", None)
    return top


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
# Minimum fingerprint overlap; acts as a second lexical safety check.
DEFAULT_MIN_FINGERPRINT = 0.08
# Sentence-level semantic gate; slightly relaxed so "segment/chunk + embedding/vector" paraphrases are retained.
DEFAULT_SENTENCE_SEMANTIC = 0.58
# Sentence-level lexical gate (relaxed for paraphrase pairs like vectors/embeddings).
DEFAULT_SENTENCE_LEXICAL = 0.08


def find_matches(
    query_chunks: List[str],
    repo_chunks: List[dict],
    threshold: float = None,
    repo_type: Optional[str] = None,
    owner_id: Optional[int] = None,
    min_lexical: float = None,
    min_fingerprint: float = None,
) -> tuple:
    # Compare query chunks to repository; returns (sem_%, lex_%, fp_%, overall_%, matches).
    if threshold is None:
        threshold = DEFAULT_SEMANTIC_THRESHOLD
    if min_lexical is None:
        min_lexical = DEFAULT_MIN_LEXICAL
    if min_fingerprint is None:
        min_fingerprint = DEFAULT_MIN_FINGERPRINT
    if not query_chunks or not repo_chunks:
        return 0.0, 0.0, 0.0, 0.0, []

    # Use only repo chunks whose embedding dimension matches current model (skip old model embeddings).
    dim = get_embedding_dim()
    repo_chunks = _filter_chunks_by_embedding_dim(repo_chunks, dim)
    if not repo_chunks:
        return 0.0, 0.0, 0.0, 0.0, []

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
            total_fp = 0.0
            total_overall = 0.0
            matched_count = 0
            for qi, row in enumerate(faiss_results):
                # Evaluate all Top-K candidates, then keep the best explainable one.
                if not row:
                    continue
                q_text = query_chunks[qi]
                best_record = None
                best_combined = -1.0

                for chunk_info, sem_score in row:
                    sem_val = float(sem_score)
                    if sem_val < threshold:
                        continue
                    matched_text = chunk_info.get("chunk_text") or ""
                    lex_val = lexical_similarity(q_text, matched_text)
                    fp_val = fingerprint_similarity(q_text, matched_text)
                    if lex_val < min_lexical or fp_val < min_fingerprint:
                        continue

                    rec = _build_match_record(
                        query_chunk_index=qi,
                        query_text=q_text,
                        doc_id=chunk_info["document_id"],
                        file_name=chunk_info.get("file_name", chunk_info["document_id"]),
                        matched_chunk_index=chunk_info["chunk_index"],
                        matched_text=matched_text,
                        sem=sem_val,
                        lex=lex_val,
                        fp=fp_val,
                    )
                    if rec is None:
                        continue
                    cmb = float(rec["combined_similarity"])
                    if cmb > best_combined:
                        best_combined = cmb
                        best_record = rec

                if best_record is None:
                    continue

                matches.append(best_record)
                total_sem += best_record["semantic_similarity"]
                total_lex += best_record["lexical_similarity"]
                total_fp += best_record["fingerprint_similarity"]
                total_overall += best_record["combined_similarity"]
                matched_count += 1
            sem_overall = (total_sem / len(query_chunks)) * 100 if matched_count else 0.0
            lex_overall = (total_lex / len(query_chunks)) * 100 if matched_count else 0.0
            fp_overall = (total_fp / len(query_chunks)) * 100 if matched_count else 0.0
            combined_overall = (total_overall / len(query_chunks)) * 100 if matched_count else 0.0
            return round(sem_overall, 2), round(lex_overall, 2), round(fp_overall, 2), round(combined_overall, 2), matches

    # Brute-force path: compare each query chunk to every repo chunk (used when FAISS not available or repo small).
    query_embeddings = encode_chunks(query_chunks)
    matches = []
    total_sem = 0.0
    total_lex = 0.0
    total_fp = 0.0
    total_overall = 0.0
    matched_count = 0
    for qi, q_emb in enumerate(query_embeddings):
        best_sem = 0.0
        best_lex = 0.0
        best_fp = 0.0
        best_overall = 0.0
        best_match = None
        q_text = query_chunks[qi]
        for rc in repo_chunks:
            if "embedding" not in rc or rc["embedding"] is None:
                continue
            matched_text = rc.get("chunk_text") or ""
            sem = cosine_similarity(q_emb, np.frombuffer(rc["embedding"], dtype=np.float32))
            lex = lexical_similarity(q_text, matched_text)
            fp = fingerprint_similarity(q_text, matched_text)
            combined = (0.70 * sem) + (0.20 * lex) + (0.10 * fp)
            if sem >= threshold and lex >= min_lexical and fp >= min_fingerprint and combined > best_overall:
                rec = _build_match_record(
                    query_chunk_index=qi,
                    query_text=q_text,
                    doc_id=rc["document_id"],
                    file_name=rc.get("file_name", rc["document_id"]),
                    matched_chunk_index=rc["chunk_index"],
                    matched_text=matched_text,
                    sem=sem,
                    lex=lex,
                    fp=fp,
                )
                if rec is None:
                    continue
                best_sem = sem
                best_lex = lex
                best_fp = fp
                best_overall = combined
                best_match = rec
        if best_match:
            matches.append(best_match)
            total_sem += best_sem
            total_lex += best_lex
            total_fp += best_fp
            total_overall += best_overall
            matched_count += 1
    sem_overall = (total_sem / len(query_chunks)) * 100 if matched_count else 0.0
    lex_overall = (total_lex / len(query_chunks)) * 100 if matched_count else 0.0
    fp_overall = (total_fp / len(query_chunks)) * 100 if matched_count else 0.0
    combined_overall = (total_overall / len(query_chunks)) * 100 if matched_count else 0.0
    return round(sem_overall, 2), round(lex_overall, 2), round(fp_overall, 2), round(combined_overall, 2), matches
