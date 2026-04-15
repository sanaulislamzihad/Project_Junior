# faiss_index.py
# We plan to integrate FAISS vector indexing to replace the current brute-force similarity search.
# This will significantly improve the efficiency and speed of our system when handling large document repositories.

import os
# Used for joining path when saving/loading index to disk.
import numpy as np
# NumPy arrays for embeddings; FAISS expects float32 arrays.

# Optional import: FAISS is used for fast nearest-neighbor search over vectors.
try:
    import faiss
    # Move index to GPU if CUDA is available (faiss-gpu must be installed).
    try:
        import torch as _torch
        _GPU_AVAILABLE = _torch.cuda.is_available()
    except Exception:
        _GPU_AVAILABLE = False
except ImportError:
    faiss = None
    _GPU_AVAILABLE = False
    # If faiss-cpu is not installed, we fall back to brute-force in embedding_pipeline.

# Resolve this file's directory so we can place cache next to backend.
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
# Index cache dir: one FAISS index file per repository (university or personal_<owner_id>).
INDEX_DIR = os.path.join(_THIS_DIR, "faiss_index_cache")
# Use FAISS only when repo has at least this many chunks; below that brute-force can be faster.
FAISS_MIN_CHUNKS = 20
# Number of nearest neighbors to return per query chunk (Top-K).
# Set high enough so large documents (250-page PDFs) return all matching chunks.
DEFAULT_TOP_K = 50


def _index_key(repo_type: str, owner_id, model_name: str = "default") -> str:
    # Build a unique key for this repository + model so we never mix indexes from different models.
    model_slug = model_name.replace("/", "_").replace("-", "_")
    if repo_type == "both" and owner_id is not None:
        return f"both_{owner_id}_{model_slug}"
    if repo_type == "personal" and owner_id is not None:
        return f"personal_{owner_id}_{model_slug}"
    return f"university_{model_slug}"


def _ensure_index_dir():
    # Create the cache directory if it does not exist so we can write index files.
    if not os.path.isdir(INDEX_DIR):
        os.makedirs(INDEX_DIR, exist_ok=True)


def build_index_from_chunks(repo_chunks: list) -> tuple:
    # Build a FAISS index from repo chunks; returns (index, chunk_infos) with chunk_infos[i] = metadata for index row i.
    if faiss is None:
        return None, []
    if not repo_chunks:
        return None, []

    valid = []
    for rc in repo_chunks:
        # Only include chunks that have an embedding stored.
        if rc.get("embedding") is not None:
            valid.append(rc)
    if not valid:
        return None, []

    # Stack embeddings into matrix (n_chunks, embedding_dim), float32 for FAISS.
    embeddings = np.array(
        [np.frombuffer(rc["embedding"], dtype=np.float32) for rc in valid],
        dtype=np.float32,
    )
    # L2-normalize so that IndexFlatIP inner product equals cosine similarity.
    faiss.normalize_L2(embeddings)
    d = embeddings.shape[1]
    # IndexFlatIP: exact inner-product search (no approximation); good for accuracy.
    cpu_index = faiss.IndexFlatIP(d)
    # Move index to GPU if available for faster search (requires faiss-gpu).
    if _GPU_AVAILABLE:
        try:
            res = faiss.StandardGpuResources()
            index = faiss.index_cpu_to_gpu(res, 0, cpu_index)
        except Exception:
            index = cpu_index
    else:
        index = cpu_index
    # Add all repository vectors to the index (one row per chunk).
    index.add(embeddings)
    # chunk_infos[i] maps index row i back to document_id, file_name, chunk_index, chunk_text.
    chunk_infos = [
        {
            "document_id": rc["document_id"],
            "file_name": rc.get("file_name", rc["document_id"]),
            "chunk_index": rc["chunk_index"],
            "chunk_text": rc.get("chunk_text") or "",
        }
        for rc in valid
    ]
    return index, chunk_infos


def search_faiss(index, chunk_infos: list, query_embeddings: np.ndarray, k: int = DEFAULT_TOP_K):
    # Run Top-K search: for each query vector, return k nearest repo chunks (chunk_info, similarity).
    if index is None or not chunk_infos or query_embeddings is None or len(query_embeddings) == 0:
        return []
    # Copy and ensure float32; FAISS expects 2D array (n_queries, dim).
    Q = np.asarray(query_embeddings, dtype=np.float32)
    if Q.ndim == 1:
        Q = Q.reshape(1, -1)
    # Normalize query vectors so inner product with DB vectors = cosine similarity.
    faiss.normalize_L2(Q)
    # Always search all chunks so exact/high matches are never missed.
    k = index.ntotal
    if k <= 0:
        return []
    # D = similarities (inner products), I = indices into chunk_infos.
    D, I = index.search(Q, k)
    results = []
    for i in range(Q.shape[0]):
        row = []
        for j in range(I.shape[1]):
            idx = int(I[i, j])
            if idx < 0:
                continue
            if idx >= len(chunk_infos):
                continue
            sim = float(D[i, j])
            row.append((chunk_infos[idx], sim))
        results.append(row)
    return results


def save_index_to_disk(repo_type: str, owner_id, index, chunk_infos: list, model_name: str = "default"):
    # Save FAISS index and chunk metadata to disk so we can reload without rebuilding from DB.
    if faiss is None or index is None:
        return
    _ensure_index_dir()
    key = _index_key(repo_type, owner_id, model_name)
    index_path = os.path.join(INDEX_DIR, f"{key}.faiss")
    # GPU indexes cannot be written directly — convert to CPU first.
    try:
        save_index = faiss.index_gpu_to_cpu(index)
    except Exception:
        save_index = index
    faiss.write_index(save_index, index_path)
    import json
    meta_path = os.path.join(INDEX_DIR, f"{key}.meta")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(chunk_infos, f)


def load_index_from_disk(repo_type: str, owner_id, model_name: str = "default") -> tuple:
    # Load FAISS index and chunk_infos from disk; returns (index, chunk_infos) or (None, []).
    if faiss is None:
        return None, []
    key = _index_key(repo_type, owner_id, model_name)
    index_path = os.path.join(INDEX_DIR, f"{key}.faiss")
    meta_path = os.path.join(INDEX_DIR, f"{key}.meta")
    if not os.path.isfile(index_path) or not os.path.isfile(meta_path):
        return None, []
    try:
        index = faiss.read_index(index_path)
        # Move to GPU if available for faster search.
        if _GPU_AVAILABLE:
            try:
                res = faiss.StandardGpuResources()
                index = faiss.index_cpu_to_gpu(res, 0, index)
            except Exception:
                pass  # Fall back to CPU index if GPU transfer fails
    except Exception:
        return None, []
    try:
        import json
        with open(meta_path, "r", encoding="utf-8") as f:
            chunk_infos = json.load(f)
    except Exception:
        return None, []
    return index, chunk_infos


def invalidate_cached_index(repo_type: str, owner_id, model_name: str = "default"):
    # Remove cached index for this repo+model so next search rebuilds from DB.
    _ensure_index_dir()
    key = _index_key(repo_type, owner_id, model_name)
    for ext in (".faiss", ".meta"):
        path = os.path.join(INDEX_DIR, f"{key}{ext}")
        try:
            if os.path.isfile(path):
                os.remove(path)
        except Exception:
            pass


def invalidate_all_cached_indexes():
    # Remove all cached FAISS indexes (e.g. when a document is deleted and we do not know its repo).
    if not os.path.isdir(INDEX_DIR):
        return
    for name in os.listdir(INDEX_DIR):
        path = os.path.join(INDEX_DIR, name)
        try:
            if os.path.isfile(path):
                os.remove(path)
        except Exception:
            pass