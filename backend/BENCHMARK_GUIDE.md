# Benchmark Guide (Model + Speed)

This project now includes a simple benchmark utility for comparing embedding model quality and runtime:

- Script: `backend/benchmark_models.py`
- Goal: choose a better embedding model using labeled text pairs (`similar` vs `not similar`)

## 1) Run Quick Benchmark (built-in sample pairs)

From project root:

```bash
python backend/benchmark_models.py
```

This runs 3 default models:

- `sentence-transformers/all-mpnet-base-v2`
- `sentence-transformers/all-MiniLM-L6-v2`
- `BAAI/bge-base-en-v1.5`

## 2) Run With Your Own Dataset

Create a JSON file (example: `backend/benchmark_pairs.json`):

```json
[
  {
    "text_a": "Original report sentence...",
    "text_b": "Paraphrased/possibly copied sentence...",
    "label": 1
  },
  {
    "text_a": "Completely unrelated sentence...",
    "text_b": "Another unrelated sentence...",
    "label": 0
  }
]
```

Then run:

```bash
python backend/benchmark_models.py --dataset backend/benchmark_pairs.json
```

## 3) Test Specific Models

```bash
python backend/benchmark_models.py --models sentence-transformers/all-mpnet-base-v2 intfloat/e5-base-v2
```

## 4) How To Decide

Prefer a model that gives:

- Higher `accuracy`
- Better `avg_positive_cosine` vs `avg_negative_cosine` separation
- Acceptable `encode_ms` / `per_pair_encode_ms` for your deployment

## 5) Integration Step

After selecting a winner, update `EMBEDDING_MODEL` in `backend/embedding_pipeline.py` and rebuild new document embeddings (old embedding dimensions may differ).
