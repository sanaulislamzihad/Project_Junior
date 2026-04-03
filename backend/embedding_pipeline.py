# embedding_pipeline.py
# Semantic similarity via sentence-transformers/all-mpnet-base-v2; lexical via Jaccard.
# FAISS vector indexing is used when the repository is large for efficient similarity search.

import hashlib
import logging
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from difflib import SequenceMatcher
from typing import List, Optional

import numpy as np

logger = logging.getLogger(__name__)

MAX_CONCURRENT_WORKERS = min(4, os.cpu_count() or 4)

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


def winnowing_similarity(text_a: str, text_b: str, k: int = 5, w: int = 4) -> float:
    """Winnowing algorithm similarity (Stanford MOSS). Jaccard over winnowed fingerprint sets."""
    def _winnow(text: str) -> set:
        compact = re.sub(r"\s+", "", text.lower())
        if len(compact) < k:
            return set()
        hashes = [hash(compact[i:i + k]) for i in range(len(compact) - k + 1)]
        if len(hashes) < w:
            return set(hashes)
        fingerprints = set()
        for i in range(len(hashes) - w + 1):
            fingerprints.add(min(hashes[i:i + w]))
        return fingerprints

    fp_a = _winnow(text_a)
    fp_b = _winnow(text_b)
    if not fp_a or not fp_b:
        return 0.0
    inter = len(fp_a & fp_b)
    union = len(fp_a | fp_b)
    return inter / union if union > 0 else 0.0


def _split_sentences(text: str) -> List[str]:
    """
    Sentence splitter that works on BOTH original-case AND lowercased text.
    After pipeline lowercasing, we cannot rely on uppercase-next-char heuristics,
    so we split on '. ' boundaries regardless of case.
    """
    if not text:
        return []
    cleaned = re.sub(r"\s+", " ", text).strip()
    if not cleaned:
        return []

    # Primary: split on sentence-ending punctuation followed by whitespace
    # Works for both "Sentence. Next" and "sentence. next" (lowercase pipeline output)
    parts = re.split(r"(?<=[.!?])\s+", cleaned)

    sentences = [p.strip() for p in parts if p and len(p.strip()) >= 15]

    # If splitting produced only 1 result on a long text, try splitting by newlines too
    if len(sentences) <= 1 and len(cleaned) > 100:
        parts2 = [p.strip() for p in cleaned.split("\n") if p.strip() and len(p.strip()) >= 15]
        if len(parts2) > 1:
            return parts2

    return sentences if sentences else [cleaned]


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


def _sentence_level_matches(
    query_text: str,
    matched_text: str,
    min_semantic: float,
    min_lexical: float,
    min_fingerprint: float = 0.08,
) -> List[dict]:
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
            lex = lexical_similarity(q_sentences[i].lower(), m_sentences[j].lower())
            fp = fingerprint_similarity(q_sentences[i].lower(), m_sentences[j].lower())
            # OR gate: high semantic OR both lexical+fingerprint pass
            # This catches paraphrases (high sem, low lex) AND copies (low sem, high lex)
            sem_pass = sem >= min_semantic
            lex_fp_pass = (lex >= min_lexical and fp >= min_fingerprint)
            if not (sem_pass or lex_fp_pass):
                continue
            # Require at least minimum semantic to avoid pure keyword matches
            if sem < 0.35:
                continue
            score = (0.65 * sem) + (0.15 * lex) + (0.10 * fp) + (0.10 * winnowing_similarity(q_sentences[i].lower(), m_sentences[j].lower()))
            if best is None or score > best["score"]:
                best = {
                    "query_sentence": q_sentences[i],
                    "matched_sentence": m_sentences[j],
                    "semantic_similarity": round(float(sem), 4),
                    "lexical_similarity": round(float(lex), 4),
                    "fingerprint_similarity": round(float(fp), 4),
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
        min_fingerprint=DEFAULT_MIN_FINGERPRINT,
    )
    common_portions = _extract_common_portions(query_text, matched_text)
    # Keep match if we have sentence-level evidence OR if chunk-level semantic is very high
    # (high semantic alone can indicate paraphrase plagiarism)
    if not sentence_matches and not common_portions:
        # For very high semantic similarity (>= 0.72), still report the match even without
        # explicit sentence evidence — this catches heavy paraphrasing
        if sem < 0.72:
            return None
        # Build synthetic sentence entry from full chunk text for reporting
        sentence_matches = [{
            "query_sentence": query_text[:300].strip(),
            "matched_sentence": matched_text[:300].strip(),
            "semantic_similarity": round(float(sem), 4),
            "lexical_similarity": round(float(lex), 4),
            "fingerprint_similarity": round(float(fp), 4),
        }]

    winnow = winnowing_similarity(query_text, matched_text)
    combined = (0.60 * sem) + (0.15 * lex) + (0.15 * winnow) + (0.10 * fp)
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
        "winnowing_similarity": round(float(winnow), 4),
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


# Chunk-level semantic threshold: 0.60 catches paraphrases without too many false positives
DEFAULT_SEMANTIC_THRESHOLD = 0.60
# Minimum lexical overlap at chunk level
DEFAULT_MIN_LEXICAL = 0.08
# Minimum fingerprint overlap at chunk level
DEFAULT_MIN_FINGERPRINT = 0.05
# Sentence-level semantic gate — lowered so paraphrases pass
DEFAULT_SENTENCE_SEMANTIC = 0.50
# Sentence-level lexical gate — very low: semantic alone can indicate plagiarism
DEFAULT_SENTENCE_LEXICAL = 0.05


def _match_query_chunk_bruteforce(
    qi: int,
    q_emb: np.ndarray,
    q_text: str,
    repo_chunks: List[dict],
    threshold: float,
    min_lexical: float,
    min_fingerprint: float,
) -> dict:
    """Score one query chunk against every repo chunk (brute-force path)."""
    q_lower = q_text.lower()
    best_per_doc = {}
    for rc in repo_chunks:
        if "embedding" not in rc or rc["embedding"] is None:
            continue
        doc_id = rc["document_id"]
        matched_text = rc.get("chunk_text") or ""
        sem = cosine_similarity(q_emb, np.frombuffer(rc["embedding"], dtype=np.float32))
        lex = lexical_similarity(q_lower, matched_text.lower())
        fp = fingerprint_similarity(q_lower, matched_text.lower())
        winnow = winnowing_similarity(q_lower, matched_text.lower())
        combined = (0.60 * sem) + (0.15 * lex) + (0.15 * winnow) + (0.10 * fp)
        if sem >= threshold and lex >= min_lexical and fp >= min_fingerprint:
            if combined > best_per_doc.get(doc_id, {}).get("combined", 0):
                best_per_doc[doc_id] = {
                    "combined": combined, "sem": sem, "lex": lex, "fp": fp,
                    "rc": rc, "matched_text": matched_text,
                }
    if not best_per_doc:
        return {"matches": [], "top": None}

    top = max(best_per_doc.values(), key=lambda x: x["combined"])
    matches = []
    any_built = False
    for doc_id, raw in best_per_doc.items():
        rc = raw["rc"]
        rec = _build_match_record(
            query_chunk_index=qi,
            query_text=q_text,
            doc_id=rc["document_id"],
            file_name=rc.get("file_name", rc["document_id"]),
            matched_chunk_index=rc["chunk_index"],
            matched_text=raw["matched_text"],
            sem=raw["sem"], lex=raw["lex"], fp=raw["fp"],
        )
        if rec is not None:
            matches.append(rec)
            any_built = True
    return {"matches": matches, "top": top if any_built else None}


def _match_query_chunk_faiss(
    qi: int,
    q_text: str,
    faiss_row: list,
    threshold: float,
    min_lexical: float,
    min_fingerprint: float,
) -> dict:
    """Score one query chunk using pre-computed FAISS top-K candidates."""
    if not faiss_row:
        return {"matches": [], "top": None}

    q_lower = q_text.lower()
    best_per_doc = {}
    for chunk_info, sem_score in faiss_row:
        sem_val = float(sem_score)
        if sem_val < threshold:
            continue
        doc_id = chunk_info["document_id"]
        matched_text = chunk_info.get("chunk_text") or ""
        lex_val = lexical_similarity(q_lower, matched_text.lower())
        fp_val = fingerprint_similarity(q_lower, matched_text.lower())
        if lex_val < min_lexical or fp_val < min_fingerprint:
            continue
        winnow_val = winnowing_similarity(q_lower, matched_text.lower())
        combined = (0.60 * sem_val) + (0.15 * lex_val) + (0.15 * winnow_val) + (0.10 * fp_val)
        if combined > best_per_doc.get(doc_id, {}).get("combined", -1.0):
            best_per_doc[doc_id] = {
                "combined": combined, "chunk_info": chunk_info,
                "matched_text": matched_text,
                "sem": sem_val, "lex": lex_val, "fp": fp_val,
            }

    if not best_per_doc:
        return {"matches": [], "top": None}

    top = max(best_per_doc.values(), key=lambda x: x["combined"])
    matches = []
    any_built = False
    for doc_id, raw in best_per_doc.items():
        ci = raw["chunk_info"]
        rec = _build_match_record(
            query_chunk_index=qi,
            query_text=q_text,
            doc_id=ci["document_id"],
            file_name=ci.get("file_name", ci["document_id"]),
            matched_chunk_index=ci["chunk_index"],
            matched_text=raw["matched_text"],
            sem=raw["sem"], lex=raw["lex"], fp=raw["fp"],
        )
        if rec is not None:
            matches.append(rec)
            any_built = True
    return {"matches": matches, "top": top if any_built else None}


def _aggregate_parallel_results(
    results: List[dict],
    n_query_chunks: int,
) -> tuple:
    """Merge per-chunk worker outputs into final similarity scores and match list."""
    all_matches = []
    total_sem = 0.0
    total_lex = 0.0
    total_fp = 0.0
    total_overall = 0.0
    matched_count = 0

    for result in results:
        all_matches.extend(result["matches"])
        if result["top"] is not None:
            top = result["top"]
            total_sem += top["sem"]
            total_lex += top["lex"]
            total_fp += top["fp"]
            total_overall += top["combined"]
            matched_count += 1

    # Match rate = what % of chunks had any match
    match_rate = matched_count / n_query_chunks if n_query_chunks else 0.0

    # Average quality of matched chunks only
    avg_sem  = (total_sem / matched_count) if matched_count else 0.0
    avg_lex  = (total_lex / matched_count) if matched_count else 0.0
    avg_fp   = (total_fp / matched_count) if matched_count else 0.0
    avg_comb = (total_overall / matched_count) if matched_count else 0.0

    # Final score = match_rate * avg_quality * 100
    sem_overall      = round(match_rate * avg_sem * 100, 2)
    lex_overall      = round(match_rate * avg_lex * 100, 2)
    fp_overall       = round(match_rate * avg_fp * 100, 2)
    combined_overall = round(match_rate * avg_comb * 100, 2)

    return (
        sem_overall,
        lex_overall,
        fp_overall,
        combined_overall,
        all_matches,
    )


def find_matches(
    query_chunks: List[str],
    repo_chunks: List[dict],
    threshold: float = None,
    repo_type: Optional[str] = None,
    owner_id: Optional[int] = None,
    min_lexical: float = None,
    min_fingerprint: float = None,
    max_workers: int = None,
) -> tuple:
    """Compare query chunks to repository in parallel; returns (sem_%, lex_%, fp_%, overall_%, matches)."""
    t_start = time.perf_counter()

    if threshold is None:
        threshold = DEFAULT_SEMANTIC_THRESHOLD
    if min_lexical is None:
        min_lexical = DEFAULT_MIN_LEXICAL
    if min_fingerprint is None:
        min_fingerprint = DEFAULT_MIN_FINGERPRINT
    if max_workers is None:
        max_workers = MAX_CONCURRENT_WORKERS
    if not query_chunks or not repo_chunks:
        return 0.0, 0.0, 0.0, 0.0, []

    dim = get_embedding_dim()
    repo_chunks = _filter_chunks_by_embedding_dim(repo_chunks, dim)
    if not repo_chunks:
        return 0.0, 0.0, 0.0, 0.0, []

    n_workers = min(max_workers, len(query_chunks))
    logger.info(
        "find_matches: %d query chunks x %d repo chunks (workers=%d)",
        len(query_chunks), len(repo_chunks), n_workers,
    )

    use_faiss = (
        faiss is not None
        and build_index_from_chunks is not None
        and search_faiss is not None
        and len(repo_chunks) >= FAISS_MIN_CHUNKS
    )

    if use_faiss:
        index, chunk_infos = (
            load_index_from_disk(repo_type, owner_id)
            if load_index_from_disk else (None, [])
        )
        if index is None or not chunk_infos:
            index, chunk_infos = build_index_from_chunks(repo_chunks)
            if index is not None and chunk_infos and save_index_to_disk and repo_type is not None:
                save_index_to_disk(repo_type, owner_id, index, chunk_infos)
        if index is not None and chunk_infos:
            t_enc = time.perf_counter()
            query_embeddings = encode_chunks(query_chunks)
            logger.info("find_matches: query encoding %.3fs", time.perf_counter() - t_enc)

            faiss_results = search_faiss(index, chunk_infos, query_embeddings, k=DEFAULT_TOP_K)

            t_par = time.perf_counter()
            results: List[dict] = []
            with ThreadPoolExecutor(max_workers=n_workers) as pool:
                futures = {
                    pool.submit(
                        _match_query_chunk_faiss, qi, query_chunks[qi],
                        faiss_results[qi], threshold, min_lexical, min_fingerprint,
                    ): qi
                    for qi in range(len(query_chunks))
                }
                for future in as_completed(futures):
                    try:
                        results.append(future.result())
                    except Exception:
                        logger.warning(
                            "find_matches: chunk %d failed, skipping",
                            futures[future], exc_info=True,
                        )

            logger.info(
                "find_matches[faiss]: parallel matching %.3fs (%d workers)",
                time.perf_counter() - t_par, n_workers,
            )
            final = _aggregate_parallel_results(results, len(query_chunks))
            logger.info(
                "find_matches: completed in %.3fs — %d matches",
                time.perf_counter() - t_start, len(final[4]),
            )
            return final

    # Brute-force path: parallel comparison of each query chunk against every repo chunk.
    t_enc = time.perf_counter()
    query_embeddings = encode_chunks(query_chunks)
    logger.info("find_matches: query encoding %.3fs", time.perf_counter() - t_enc)

    t_par = time.perf_counter()
    results: List[dict] = []
    with ThreadPoolExecutor(max_workers=n_workers) as pool:
        futures = {
            pool.submit(
                _match_query_chunk_bruteforce, qi, query_embeddings[qi],
                query_chunks[qi], repo_chunks, threshold, min_lexical, min_fingerprint,
            ): qi
            for qi in range(len(query_chunks))
        }
        for future in as_completed(futures):
            try:
                results.append(future.result())
            except Exception:
                logger.warning(
                    "find_matches: chunk %d failed, skipping",
                    futures[future], exc_info=True,
                )

    logger.info(
        "find_matches[brute-force]: parallel matching %.3fs (%d workers)",
        time.perf_counter() - t_par, n_workers,
    )
    final = _aggregate_parallel_results(results, len(query_chunks))
    logger.info(
        "find_matches: completed in %.3fs — %d matches",
        time.perf_counter() - t_start, len(final[4]),
    )
    return final