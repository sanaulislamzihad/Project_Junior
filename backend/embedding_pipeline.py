"""
Embedding pipeline: paraphrase-MiniLM-L6-v2 for semantic similarity,
Jaccard/word overlap for lexical similarity.
"""
import re
from typing import List
import numpy as np

_MODEL = None


def _tokenize(text: str) -> set:
    """Lowercase, split on non-word, return set of words."""
    if not text:
        return set()
    return set(re.findall(r"\w+", text.lower()))


def lexical_similarity(text_a: str, text_b: str) -> float:
    """Jaccard similarity on word sets. Returns 0-1."""
    a, b = _tokenize(text_a), _tokenize(text_b)
    if not a or not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    return inter / union if union > 0 else 0.0


def _get_model():
    """Lazy-load the sentence transformer model."""
    global _MODEL
    if _MODEL is None:
        from sentence_transformers import SentenceTransformer
        _MODEL = SentenceTransformer("paraphrase-MiniLM-L6-v2")
    return _MODEL


def encode_chunks(chunks: List[str]) -> np.ndarray:
    """Encode text chunks to embeddings. Returns numpy array of shape (n_chunks, embedding_dim)."""
    if not chunks:
        return np.array([]).reshape(0, 384)
    model = _get_model()
    embeddings = model.encode(chunks, convert_to_numpy=True)
    return np.asarray(embeddings, dtype=np.float32)


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Compute cosine similarity between two vectors."""
    a = np.asarray(a, dtype=np.float32).flatten()
    b = np.asarray(b, dtype=np.float32).flatten()
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def find_matches(
    query_chunks: List[str],
    repo_chunks: List[dict],
    threshold: float = 0.5,
) -> tuple:
    """
    Compare query chunks against repo chunks using semantic + lexical similarity.
    Returns (semantic_overall_0_100, lexical_overall_0_100, matches list).
    Each match has: semantic_similarity, lexical_similarity, file_name, etc.
    """
    if not query_chunks or not repo_chunks:
        return 0.0, 0.0, []

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
            if sem >= threshold and sem > best_sem:
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
