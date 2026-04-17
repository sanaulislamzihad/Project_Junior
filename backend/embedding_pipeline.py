# embedding_pipeline.py
# Semantic similarity via sentence-transformers; lexical via Jaccard.
# Supports multiple embedding models: default (all-mpnet-base-v2) and scincl (malteos/scincl).
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

# ---------------------------------------------------------------------------
# Available embedding models
# ---------------------------------------------------------------------------
AVAILABLE_MODELS = {
    "default": {
        "model_id": "sentence-transformers/all-mpnet-base-v2",
        "dim": 768,
        "label": "General Purpose",
        "description": "Best for general academic writing. Works fully offline.",
    },
    "paraphrase": {
        "model_id": "sentence-transformers/paraphrase-mpnet-base-v2",
        "dim": 768,
        "label": "Research / Paraphrase Detection",
        "description": "Detects paraphrased content — same ideas in different words. Best for research papers.",
    },
}
DEFAULT_MODEL_NAME = "default"

# ---------------------------------------------------------------------------
# GPU / device detection
# ---------------------------------------------------------------------------
def _detect_device() -> str:
    """Auto-detect the best available compute device (cuda > mps > cpu)."""
    try:
        import torch
        if torch.cuda.is_available():
            logger.info("GPU detected: using CUDA (%s)", torch.cuda.get_device_name(0))
            return "cuda"
        if torch.backends.mps.is_available():
            logger.info("GPU detected: using Apple MPS")
            return "mps"
    except Exception:
        pass
    logger.info("No GPU detected: using CPU")
    return "cpu"

DEVICE = _detect_device()

_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_CACHE_DIR = os.path.join(_THIS_DIR, "model_cache")

# NOTE: We do NOT set HF_HUB_OFFLINE globally here.
# Instead, _get_model() passes local_files_only=True when the model is already cached,
# which avoids any network call for cached models without blocking downloads for new ones.

# ---------------------------------------------------------------------------
# Multi-model cache: one loaded model per model_name key
# ---------------------------------------------------------------------------
_MODEL_CACHE: dict = {}
_MODEL_LOCK = __import__("threading").Lock()


def _is_model_cached(model_id: str) -> bool:
    """Check if a model has been downloaded to the local model_cache directory."""
    if not os.path.isdir(MODEL_CACHE_DIR):
        return False
    slug1 = model_id.replace("/", "_")
    slug2 = "models--" + model_id.replace("/", "--")
    for slug in (slug1, slug2):
        path = os.path.join(MODEL_CACHE_DIR, slug)
        if os.path.isdir(path) and os.listdir(path):
            return True
    # Also check for any subdir that contains the model name
    try:
        for name in os.listdir(MODEL_CACHE_DIR):
            if slug1.lower() in name.lower() or model_id.split("/")[-1].lower() in name.lower():
                if os.path.isdir(os.path.join(MODEL_CACHE_DIR, name)):
                    return True
    except Exception:
        pass
    return False


def _get_model(model_name: str = DEFAULT_MODEL_NAME):
    """Load the requested model, unloading any other model first (one model in memory at a time).
    - If already cached on disk: loads with local_files_only=True (no network call).
    - If not cached: downloads from HuggingFace (requires internet on first use).
    """
    if model_name not in AVAILABLE_MODELS:
        model_name = DEFAULT_MODEL_NAME

    if model_name in _MODEL_CACHE:
        return _MODEL_CACHE[model_name]

    with _MODEL_LOCK:
        if model_name in _MODEL_CACHE:
            return _MODEL_CACHE[model_name]

        # Unload any other model from memory before loading the new one
        for other in list(_MODEL_CACHE.keys()):
            if other != model_name:
                logger.info("Unloading model '%s' to free memory.", other)
                del _MODEL_CACHE[other]

        from sentence_transformers import SentenceTransformer
        os.makedirs(MODEL_CACHE_DIR, exist_ok=True)
        model_id = AVAILABLE_MODELS[model_name]["model_id"]
        cached = _is_model_cached(model_id)

        try:
            if cached:
                model = SentenceTransformer(
                    model_id,
                    cache_folder=MODEL_CACHE_DIR,
                    device=DEVICE,
                    local_files_only=True,
                )
            else:
                logger.info("Model '%s' not cached. Downloading from HuggingFace...", model_id)
                model = SentenceTransformer(
                    model_id,
                    cache_folder=MODEL_CACHE_DIR,
                    device=DEVICE,
                )
                logger.info("Model '%s' downloaded and cached successfully.", model_id)
        except Exception as err:
            raise RuntimeError(
                f"MODEL_NOT_AVAILABLE:{model_name}:{model_id}"
            ) from err

        _MODEL_CACHE[model_name] = model
        logger.info("Model '%s' (%s) loaded on device: %s", model_name, model_id, DEVICE)
        return model


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


def _sentence_level_matches_precomputed(
    q_sentences: List[str],
    m_sentences: List[str],
    q_emb: np.ndarray,
    m_emb: np.ndarray,
    min_semantic: float,
    min_lexical: float,
    min_fingerprint: float = 0.08,
    model_name: str = DEFAULT_MODEL_NAME,
) -> List[dict]:
    # Same logic as _sentence_level_matches but uses pre-computed embeddings.
    if len(q_emb) == 0 or len(m_emb) == 0:
        return []
    matches = []
    for i, q_vec in enumerate(q_emb):
        best = None
        for j, m_vec in enumerate(m_emb):
            sem = cosine_similarity(q_vec, m_vec)
            lex = lexical_similarity(q_sentences[i].lower(), m_sentences[j].lower())
            fp = fingerprint_similarity(q_sentences[i].lower(), m_sentences[j].lower())
            if not (sem >= min_semantic or lex >= min_lexical):
                continue
            hard_floor = _get_thresholds(model_name)["sem_hard_floor"]
            if sem < hard_floor:
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


def _sentence_level_matches(
    query_text: str,
    matched_text: str,
    min_semantic: float,
    min_lexical: float,
    min_fingerprint: float = 0.08,
    model_name: str = DEFAULT_MODEL_NAME,
) -> List[dict]:
    # Find sentence-to-sentence matches to explain why a chunk matched.
    q_sentences = _split_sentences(query_text)
    m_sentences = _split_sentences(matched_text)
    if not q_sentences or not m_sentences:
        return []

    all_emb = encode_chunks(q_sentences + m_sentences, model_name=model_name)
    q_emb = all_emb[:len(q_sentences)]
    m_emb = all_emb[len(q_sentences):]
    if len(q_emb) == 0 or len(m_emb) == 0:
        return []

    matches = []
    for i, q_vec in enumerate(q_emb):
        best = None
        for j, m_vec in enumerate(m_emb):
            sem = cosine_similarity(q_vec, m_vec)
            lex = lexical_similarity(q_sentences[i].lower(), m_sentences[j].lower())
            fp = fingerprint_similarity(q_sentences[i].lower(), m_sentences[j].lower())
            sem_pass = sem >= min_semantic
            lex_pass = (lex >= min_lexical)
            if not (sem_pass or lex_pass):
                continue
            hard_floor = _get_thresholds(model_name)["sem_hard_floor"]
            if sem < hard_floor:
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
    model_name: str = DEFAULT_MODEL_NAME,
) -> Optional[dict]:
    thr = _get_thresholds(model_name)
    sentence_matches = _sentence_level_matches(
        query_text,
        matched_text,
        min_semantic=thr["sentence_semantic"],
        min_lexical=thr["sentence_lexical"],
        min_fingerprint=thr["min_fingerprint"],
        model_name=model_name,
    )
    common_portions = _extract_common_portions(query_text, matched_text)
    paraphrase_floor = max(0.72, thr["semantic_threshold"] + 0.02)
    if not sentence_matches and not common_portions:
        if sem < paraphrase_floor:
            return None
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


# Embedding dimension for all supported models is 768; used for empty-array shape.
DEFAULT_EMBEDDING_DIM = 768


def get_embedding_dim(model_name: str = DEFAULT_MODEL_NAME) -> int:
    """Return the embedding dimension of the specified model."""
    return _get_model(model_name).get_embedding_dimension()


def encode_chunks(chunks: List[str], model_name: str = DEFAULT_MODEL_NAME) -> np.ndarray:
    """Encode a list of text chunks to embedding vectors using the specified model."""
    if not chunks:
        return np.array([]).reshape(0, DEFAULT_EMBEDDING_DIM)
    model = _get_model(model_name)
    batch_size = 128 if DEVICE in ("cuda", "mps") else 32
    embeddings = model.encode(
        chunks,
        convert_to_numpy=True,
        batch_size=batch_size,
        show_progress_bar=False,
    )
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
    # Keep only chunks whose embedding size matches current model; skip chunks from other models.
    byte_len = dim * 4
    return [rc for rc in repo_chunks if rc.get("embedding") is not None and len(rc["embedding"]) == byte_len]


# Default thresholds (all-mpnet-base-v2 — sentence-level semantic model)
DEFAULT_SEMANTIC_THRESHOLD = 0.60
DEFAULT_MIN_LEXICAL = 0.08
DEFAULT_MIN_FINGERPRINT = 0.05
DEFAULT_SENTENCE_SEMANTIC = 0.42
DEFAULT_SENTENCE_LEXICAL = 0.05

# Per-model threshold overrides.
# paraphrase-mpnet-base-v2 is a proper semantic/paraphrase model — scores behave like
# all-mpnet-base-v2 but it is fine-tuned specifically on paraphrase datasets (PAWS, QQP).
# We use slightly stricter thresholds than the default to reduce incidental overlap noise
# while still catching genuine paraphrase plagiarism in research papers.
_MODEL_THRESHOLDS: dict = {
    "paraphrase": {
        "semantic_threshold":   0.72,   # slightly stricter than default 0.60
        "min_lexical":          0.06,   # slightly relaxed — paraphrases have less word overlap
        "min_fingerprint":      0.04,
        "sentence_semantic":    0.55,   # higher than default 0.42 to reduce noise
        "sentence_lexical":     0.04,
        "sem_hard_floor":       0.45,
        "lex_bypass":           0.08,
    },
}


def _get_thresholds(model_name: str) -> dict:
    """Return the threshold dict for this model (falls back to defaults)."""
    overrides = _MODEL_THRESHOLDS.get(model_name, {})
    return {
        "semantic_threshold": overrides.get("semantic_threshold", DEFAULT_SEMANTIC_THRESHOLD),
        "min_lexical":        overrides.get("min_lexical",        DEFAULT_MIN_LEXICAL),
        "min_fingerprint":    overrides.get("min_fingerprint",    DEFAULT_MIN_FINGERPRINT),
        "sentence_semantic":  overrides.get("sentence_semantic",  DEFAULT_SENTENCE_SEMANTIC),
        "sentence_lexical":   overrides.get("sentence_lexical",   DEFAULT_SENTENCE_LEXICAL),
        "sem_hard_floor":     overrides.get("sem_hard_floor",     0.35),
        "lex_bypass":         overrides.get("lex_bypass",         0.05),
    }


def _match_query_chunk_bruteforce(
    qi: int,
    q_emb: np.ndarray,
    q_text: str,
    repo_chunks: List[dict],
    threshold: float,
    min_lexical: float,
    min_fingerprint: float,
    model_name: str = DEFAULT_MODEL_NAME,
) -> dict:
    """Score one query chunk against every repo chunk (brute-force path)."""
    q_lower = q_text.lower()
    lex_bypass_min = _get_thresholds(model_name)["lex_bypass"]
    matches_per_doc: dict = {}
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
        sem_match = (sem >= threshold and lex >= min_lexical and fp >= min_fingerprint)
        lex_bypass = (lex >= lex_bypass_min)
        if sem_match or lex_bypass:
            entry = {"combined": combined, "sem": sem, "lex": lex, "fp": fp,
                     "rc": rc, "matched_text": matched_text}
            matches_per_doc.setdefault(doc_id, []).append(entry)

    if not matches_per_doc:
        return {"matches": [], "top": None}

    all_entries = [e for bucket in matches_per_doc.values() for e in bucket]
    top = max(all_entries, key=lambda x: x["combined"])
    matches = []
    any_built = False
    for doc_id, bucket in matches_per_doc.items():
        for raw in bucket:
            rc = raw["rc"]
            rec = _build_match_record(
                query_chunk_index=qi,
                query_text=q_text,
                doc_id=rc["document_id"],
                file_name=rc.get("file_name", rc["document_id"]),
                matched_chunk_index=rc["chunk_index"],
                matched_text=raw["matched_text"],
                sem=raw["sem"], lex=raw["lex"], fp=raw["fp"],
                model_name=model_name,
            )
            if rec is not None:
                matches.append(rec)
                any_built = True
    return {"matches": matches, "top": top if any_built else None}


def _collect_candidates_bruteforce(
    qi: int,
    q_emb: np.ndarray,
    q_text: str,
    repo_chunks: List[dict],
    threshold: float,
    min_lexical: float,
    min_fingerprint: float,
    model_name: str = DEFAULT_MODEL_NAME,
) -> dict:
    """Like _match_query_chunk_bruteforce but returns raw candidates without sentence encoding."""
    q_lower = q_text.lower()
    lex_bypass_min = _get_thresholds(model_name)["lex_bypass"]
    matches_per_doc: dict = {}
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
        if (sem >= threshold and lex >= min_lexical and fp >= min_fingerprint) or (lex >= lex_bypass_min):
            matches_per_doc.setdefault(doc_id, []).append(
                {"combined": combined, "sem": sem, "lex": lex, "fp": fp, "rc": rc, "matched_text": matched_text}
            )
    if not matches_per_doc:
        return {"candidates": [], "top": None}
    all_entries = [e for bucket in matches_per_doc.values() for e in bucket]
    top = max(all_entries, key=lambda x: x["combined"])
    candidates = []
    for doc_id, bucket in matches_per_doc.items():
        for raw in bucket:
            rc = raw["rc"]
            candidates.append({
                "qi": qi, "q_text": q_text,
                "doc_id": rc["document_id"],
                "file_name": rc.get("file_name", rc["document_id"]),
                "chunk_index": rc["chunk_index"],
                "matched_text": raw["matched_text"],
                "sem": raw["sem"], "lex": raw["lex"], "fp": raw["fp"],
            })
    return {"candidates": candidates, "top": top}


def _collect_candidates_faiss(
    qi: int,
    q_text: str,
    faiss_row: list,
    threshold: float,
    min_lexical: float,
    min_fingerprint: float,
    model_name: str = DEFAULT_MODEL_NAME,
) -> dict:
    """Like _match_query_chunk_faiss but returns raw candidates without sentence encoding."""
    if not faiss_row:
        return {"candidates": [], "top": None}
    q_lower = q_text.lower()
    lex_bypass_min = _get_thresholds(model_name)["lex_bypass"]
    matches_per_doc: dict = {}
    for chunk_info, sem_score in faiss_row:
        sem_val = float(sem_score)
        doc_id = chunk_info["document_id"]
        matched_text = chunk_info.get("chunk_text") or ""
        lex_val = lexical_similarity(q_lower, matched_text.lower())
        fp_val = fingerprint_similarity(q_lower, matched_text.lower())
        if not ((sem_val >= threshold and lex_val >= min_lexical and fp_val >= min_fingerprint) or (lex_val >= lex_bypass_min)):
            continue
        winnow_val = winnowing_similarity(q_lower, matched_text.lower())
        combined = (0.60 * sem_val) + (0.15 * lex_val) + (0.15 * winnow_val) + (0.10 * fp_val)
        matches_per_doc.setdefault(doc_id, []).append(
            {"combined": combined, "chunk_info": chunk_info, "matched_text": matched_text,
             "sem": sem_val, "lex": lex_val, "fp": fp_val}
        )
    if not matches_per_doc:
        return {"candidates": [], "top": None}
    all_entries = [e for bucket in matches_per_doc.values() for e in bucket]
    top = max(all_entries, key=lambda x: x["combined"])
    candidates = []
    for doc_id, bucket in matches_per_doc.items():
        for raw in bucket:
            ci = raw["chunk_info"]
            candidates.append({
                "qi": qi, "q_text": q_text,
                "doc_id": ci["document_id"],
                "file_name": ci.get("file_name", ci["document_id"]),
                "chunk_index": ci["chunk_index"],
                "matched_text": raw["matched_text"],
                "sem": raw["sem"], "lex": raw["lex"], "fp": raw["fp"],
            })
    return {"candidates": candidates, "top": top}


def _match_query_chunk_faiss(
    qi: int,
    q_text: str,
    faiss_row: list,
    threshold: float,
    min_lexical: float,
    min_fingerprint: float,
    model_name: str = DEFAULT_MODEL_NAME,
) -> dict:
    """Score one query chunk using pre-computed FAISS top-K candidates."""
    if not faiss_row:
        return {"matches": [], "top": None}

    q_lower = q_text.lower()
    lex_bypass_min = _get_thresholds(model_name)["lex_bypass"]
    matches_per_doc: dict = {}
    for chunk_info, sem_score in faiss_row:
        sem_val = float(sem_score)
        doc_id = chunk_info["document_id"]
        matched_text = chunk_info.get("chunk_text") or ""
        lex_val = lexical_similarity(q_lower, matched_text.lower())
        fp_val = fingerprint_similarity(q_lower, matched_text.lower())
        sem_match = (sem_val >= threshold and lex_val >= min_lexical and fp_val >= min_fingerprint)
        lex_bypass = (lex_val >= lex_bypass_min)
        if not (sem_match or lex_bypass):
            continue
        winnow_val = winnowing_similarity(q_lower, matched_text.lower())
        combined = (0.60 * sem_val) + (0.15 * lex_val) + (0.15 * winnow_val) + (0.10 * fp_val)
        entry = {"combined": combined, "chunk_info": chunk_info,
                 "matched_text": matched_text,
                 "sem": sem_val, "lex": lex_val, "fp": fp_val}
        matches_per_doc.setdefault(doc_id, []).append(entry)

    if not matches_per_doc:
        return {"matches": [], "top": None}

    all_entries = [e for bucket in matches_per_doc.values() for e in bucket]
    top = max(all_entries, key=lambda x: x["combined"])
    matches = []
    any_built = False
    for doc_id, bucket in matches_per_doc.items():
        for raw in bucket:
            ci = raw["chunk_info"]
            rec = _build_match_record(
                query_chunk_index=qi,
                query_text=q_text,
                doc_id=ci["document_id"],
                file_name=ci.get("file_name", ci["document_id"]),
                matched_chunk_index=ci["chunk_index"],
                matched_text=raw["matched_text"],
                sem=raw["sem"], lex=raw["lex"], fp=raw["fp"],
                model_name=model_name,
            )
            if rec is not None:
                matches.append(rec)
                any_built = True
    return {"matches": matches, "top": top if any_built else None}


def _batch_sentence_match(
    all_candidates: List[dict],
    top_per_qi: dict,
    n_query_chunks: int,
    model_name: str,
    thr_cfg: dict,
) -> tuple:
    """Phase 2: batch encode all candidate sentences once, then build match records."""
    if not all_candidates:
        return 0.0, 0.0, 0.0, 0.0, []

    # Split sentences for every candidate
    per_cand_q: List[List[str]] = []
    per_cand_m: List[List[str]] = []
    q_offsets: List[int] = []
    m_offsets: List[int] = []
    all_q_sents: List[str] = []
    all_m_sents: List[str] = []

    for cand in all_candidates:
        q_sents = _split_sentences(cand["q_text"])
        m_sents = _split_sentences(cand["matched_text"])
        q_offsets.append(len(all_q_sents))
        m_offsets.append(len(all_m_sents))
        per_cand_q.append(q_sents)
        per_cand_m.append(m_sents)
        all_q_sents.extend(q_sents)
        all_m_sents.extend(m_sents)

    # ONE batch encode call for all sentences
    t_enc = time.perf_counter()
    all_sents = all_q_sents + all_m_sents
    if all_sents:
        all_embs = encode_chunks(all_sents, model_name=model_name)
        q_all_embs = all_embs[:len(all_q_sents)]
        m_all_embs = all_embs[len(all_q_sents):]
    else:
        q_all_embs = np.array([]).reshape(0, 0)
        m_all_embs = np.array([]).reshape(0, 0)
    logger.info("find_matches: batch sentence encoding %.3fs (%d sentences)", time.perf_counter() - t_enc, len(all_sents))

    # Build match records using pre-computed embeddings
    paraphrase_floor = max(0.72, thr_cfg["semantic_threshold"] + 0.02)
    all_matches = []
    built_qi: set = set()

    for idx, cand in enumerate(all_candidates):
        q_sents = per_cand_q[idx]
        m_sents = per_cand_m[idx]
        q_start = q_offsets[idx]
        m_start = m_offsets[idx]
        q_emb = q_all_embs[q_start:q_start + len(q_sents)] if q_sents else np.array([]).reshape(0, 0)
        m_emb = m_all_embs[m_start:m_start + len(m_sents)] if m_sents else np.array([]).reshape(0, 0)

        sentence_matches = _sentence_level_matches_precomputed(
            q_sents, m_sents, q_emb, m_emb,
            min_semantic=thr_cfg["sentence_semantic"],
            min_lexical=thr_cfg["sentence_lexical"],
            min_fingerprint=thr_cfg["min_fingerprint"],
            model_name=model_name,
        )
        common_portions = _extract_common_portions(cand["q_text"], cand["matched_text"])

        if not sentence_matches and not common_portions:
            if cand["sem"] < paraphrase_floor:
                continue
            sentence_matches = [{
                "query_sentence": cand["q_text"][:300].strip(),
                "matched_sentence": cand["matched_text"][:300].strip(),
                "semantic_similarity": round(float(cand["sem"]), 4),
                "lexical_similarity": round(float(cand["lex"]), 4),
                "fingerprint_similarity": round(float(cand["fp"]), 4),
            }]

        winnow = winnowing_similarity(cand["q_text"], cand["matched_text"])
        combined = (0.60 * cand["sem"]) + (0.15 * cand["lex"]) + (0.15 * winnow) + (0.10 * cand["fp"])
        all_matches.append({
            "query_chunk_index": cand["qi"],
            "query_text_preview": cand["q_text"][:200] + ("..." if len(cand["q_text"]) > 200 else ""),
            "matched_document_id": cand["doc_id"],
            "file_name": cand["file_name"],
            "matched_chunk_index": cand["chunk_index"],
            "matched_text_preview": cand["matched_text"][:200] + ("..." if len(cand["matched_text"]) > 200 else ""),
            "semantic_similarity": round(float(cand["sem"]), 4),
            "lexical_similarity": round(float(cand["lex"]), 4),
            "fingerprint_similarity": round(float(cand["fp"]), 4),
            "winnowing_similarity": round(float(winnow), 4),
            "combined_similarity": round(float(combined), 4),
            "similar_sentences": sentence_matches,
            "common_portions": common_portions,
        })
        built_qi.add(cand["qi"])

    # Compute overall scores using top_per_qi
    total_sem = total_lex = total_fp = total_overall = 0.0
    matched_count = len(top_per_qi)
    for top in top_per_qi.values():
        sem = top["sem"] if isinstance(top, dict) else float(top)
        lex = top.get("lex", 0.0) if isinstance(top, dict) else 0.0
        fp = top.get("fp", 0.0) if isinstance(top, dict) else 0.0
        winnow = winnowing_similarity(top.get("matched_text", ""), top.get("matched_text", "")) if isinstance(top, dict) else 0.0
        combined = (0.60 * sem) + (0.15 * lex) + (0.15 * winnow) + (0.10 * fp)
        total_sem += sem
        total_lex += lex
        total_fp += fp
        total_overall += combined

    if matched_count:
        match_rate = matched_count / n_query_chunks
        avg_sem = total_sem / matched_count
        avg_lex = total_lex / matched_count
        avg_fp = total_fp / matched_count
        avg_comb = total_overall / matched_count
    else:
        match_rate = avg_sem = avg_lex = avg_fp = avg_comb = 0.0

    return (
        round(match_rate * avg_sem * 100, 2),
        round(match_rate * avg_lex * 100, 2),
        round(match_rate * avg_fp * 100, 2),
        round(match_rate * avg_comb * 100, 2),
        all_matches,
    )


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

    match_rate = matched_count / n_query_chunks if n_query_chunks else 0.0

    avg_sem  = (total_sem / matched_count) if matched_count else 0.0
    avg_lex  = (total_lex / matched_count) if matched_count else 0.0
    avg_fp   = (total_fp / matched_count) if matched_count else 0.0
    avg_comb = (total_overall / matched_count) if matched_count else 0.0

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
    model_name: str = DEFAULT_MODEL_NAME,
) -> tuple:
    """Compare query chunks to repository in parallel; returns (sem_%, lex_%, fp_%, overall_%, matches)."""
    t_start = time.perf_counter()

    thr_cfg = _get_thresholds(model_name)
    if threshold is None:
        threshold = thr_cfg["semantic_threshold"]
    if min_lexical is None:
        min_lexical = thr_cfg["min_lexical"]
    if min_fingerprint is None:
        min_fingerprint = thr_cfg["min_fingerprint"]
    if max_workers is None:
        max_workers = MAX_CONCURRENT_WORKERS
    if not query_chunks or not repo_chunks:
        return 0.0, 0.0, 0.0, 0.0, []

    dim = get_embedding_dim(model_name)
    repo_chunks = _filter_chunks_by_embedding_dim(repo_chunks, dim)
    if not repo_chunks:
        return 0.0, 0.0, 0.0, 0.0, []

    n_workers = min(max_workers, len(query_chunks))
    logger.info(
        "find_matches[%s]: %d query chunks x %d repo chunks (workers=%d)",
        model_name, len(query_chunks), len(repo_chunks), n_workers,
    )

    use_faiss = (
        faiss is not None
        and build_index_from_chunks is not None
        and search_faiss is not None
        and len(repo_chunks) >= FAISS_MIN_CHUNKS
    )

    if use_faiss:
        index, chunk_infos = (
            load_index_from_disk(repo_type, owner_id, model_name)
            if load_index_from_disk else (None, [])
        )
        if index is None or not chunk_infos:
            index, chunk_infos = build_index_from_chunks(repo_chunks)
            if index is not None and chunk_infos and save_index_to_disk and repo_type is not None:
                save_index_to_disk(repo_type, owner_id, index, chunk_infos, model_name)
        if index is not None and chunk_infos:
            t_enc = time.perf_counter()
            query_embeddings = encode_chunks(query_chunks, model_name=model_name)
            logger.info("find_matches: query encoding %.3fs", time.perf_counter() - t_enc)

            faiss_results = search_faiss(index, chunk_infos, query_embeddings, k=DEFAULT_TOP_K)

            # Phase 1: collect candidates in parallel (no sentence encoding)
            t_par = time.perf_counter()
            all_candidates: List[dict] = []
            top_per_qi: dict = {}
            with ThreadPoolExecutor(max_workers=n_workers) as pool:
                futures = {
                    pool.submit(
                        _collect_candidates_faiss, qi, query_chunks[qi],
                        faiss_results[qi], threshold, min_lexical, min_fingerprint, model_name,
                    ): qi
                    for qi in range(len(query_chunks))
                }
                for future in as_completed(futures):
                    try:
                        res = future.result()
                        all_candidates.extend(res["candidates"])
                        if res["top"] is not None:
                            qi = futures[future]
                            top_per_qi[qi] = res["top"]
                    except Exception:
                        logger.warning("find_matches: chunk %d failed", futures[future], exc_info=True)

            logger.info("find_matches[faiss]: candidate collection %.3fs (%d candidates)", time.perf_counter() - t_par, len(all_candidates))

            # Phase 2: batch encode all sentences at once, then build match records
            final = _batch_sentence_match(all_candidates, top_per_qi, len(query_chunks), model_name, thr_cfg)
            logger.info("find_matches: completed in %.3fs — %d matches", time.perf_counter() - t_start, len(final[4]))
            return final

    # Brute-force path: parallel comparison of each query chunk against every repo chunk.
    t_enc = time.perf_counter()
    query_embeddings = encode_chunks(query_chunks, model_name=model_name)
    logger.info("find_matches: query encoding %.3fs", time.perf_counter() - t_enc)

    # Phase 1: collect candidates in parallel (no sentence encoding)
    t_par = time.perf_counter()
    all_candidates: List[dict] = []
    top_per_qi: dict = {}
    with ThreadPoolExecutor(max_workers=n_workers) as pool:
        futures = {
            pool.submit(
                _collect_candidates_bruteforce, qi, query_embeddings[qi],
                query_chunks[qi], repo_chunks, threshold, min_lexical, min_fingerprint, model_name,
            ): qi
            for qi in range(len(query_chunks))
        }
        for future in as_completed(futures):
            try:
                res = future.result()
                all_candidates.extend(res["candidates"])
                if res["top"] is not None:
                    qi = futures[future]
                    top_per_qi[qi] = res["top"]
            except Exception:
                logger.warning("find_matches: chunk %d failed", futures[future], exc_info=True)

    logger.info("find_matches[brute-force]: candidate collection %.3fs (%d candidates)", time.perf_counter() - t_par, len(all_candidates))

    # Phase 2: batch encode all sentences at once, then build match records
    final = _batch_sentence_match(all_candidates, top_per_qi, len(query_chunks), model_name, thr_cfg)
    logger.info("find_matches: completed in %.3fs — %d matches", time.perf_counter() - t_start, len(final[4]))
    return final
