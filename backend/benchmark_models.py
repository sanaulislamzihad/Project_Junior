import argparse
import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import List, Sequence

import numpy as np
from sentence_transformers import SentenceTransformer


DEFAULT_MODELS = [
    "sentence-transformers/all-mpnet-base-v2",
    "sentence-transformers/all-MiniLM-L6-v2",
    "BAAI/bge-base-en-v1.5",
]


@dataclass
class PairExample:
    text_a: str
    text_b: str
    label: int  # 1 = similar/plagiarism-like, 0 = dissimilar


def _default_examples() -> List[PairExample]:
    # Small seed set for quick benchmarking when no dataset file is provided.
    return [
        PairExample(
            text_a="The student submitted the weekly report on software testing methodology.",
            text_b="Weekly report about software testing methodology was submitted by the student.",
            label=1,
        ),
        PairExample(
            text_a="Neural networks are powerful for pattern recognition tasks.",
            text_b="Convolutional models can detect visual patterns effectively.",
            label=1,
        ),
        PairExample(
            text_a="The project budget increased due to hardware procurement delays.",
            text_b="Binary search runs in logarithmic time for sorted arrays.",
            label=0,
        ),
        PairExample(
            text_a="FastAPI handles request parsing and response serialization.",
            text_b="Database replication improves availability in distributed systems.",
            label=0,
        ),
        PairExample(
            text_a="This document explains plagiarism detection using chunk embeddings.",
            text_b="Plagiarism can be detected by comparing embedding vectors of chunks.",
            label=1,
        ),
        PairExample(
            text_a="The lecture covered object-oriented design patterns in Java.",
            text_b="A weather report predicts heavy rainfall over coastal regions.",
            label=0,
        ),
    ]


def _load_examples(dataset_path: Path | None) -> List[PairExample]:
    if dataset_path is None:
        return _default_examples()

    raw = json.loads(dataset_path.read_text(encoding="utf-8"))
    examples = []
    for row in raw:
        examples.append(
            PairExample(
                text_a=str(row["text_a"]),
                text_b=str(row["text_b"]),
                label=int(row["label"]),
            )
        )
    return examples


def _normalize(emb: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(emb, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return emb / norms


def _cosine_batch(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    return np.sum(_normalize(a) * _normalize(b), axis=1)


def _best_threshold(scores: np.ndarray, labels: np.ndarray) -> tuple[float, float]:
    # Search threshold that gives best classification accuracy.
    best_t = 0.50
    best_acc = -1.0
    for t in np.linspace(0.2, 0.95, 76):
        preds = (scores >= t).astype(int)
        acc = float(np.mean(preds == labels))
        if acc > best_acc:
            best_acc = acc
            best_t = float(t)
    return best_t, best_acc


def evaluate_model(model_name: str, examples: Sequence[PairExample]) -> dict:
    model = SentenceTransformer(model_name)
    a_texts = [x.text_a for x in examples]
    b_texts = [x.text_b for x in examples]
    labels = np.array([x.label for x in examples], dtype=np.int32)

    t0 = time.perf_counter()
    a_emb = model.encode(a_texts, convert_to_numpy=True)
    b_emb = model.encode(b_texts, convert_to_numpy=True)
    encode_ms = (time.perf_counter() - t0) * 1000.0

    t1 = time.perf_counter()
    scores = _cosine_batch(np.asarray(a_emb, dtype=np.float32), np.asarray(b_emb, dtype=np.float32))
    score_ms = (time.perf_counter() - t1) * 1000.0

    threshold, accuracy = _best_threshold(scores, labels)
    positives = scores[labels == 1]
    negatives = scores[labels == 0]

    return {
        "model": model_name,
        "pairs": len(examples),
        "best_threshold": round(threshold, 3),
        "accuracy": round(accuracy, 4),
        "avg_positive_cosine": round(float(np.mean(positives)) if len(positives) else 0.0, 4),
        "avg_negative_cosine": round(float(np.mean(negatives)) if len(negatives) else 0.0, 4),
        "encode_ms": round(encode_ms, 2),
        "score_ms": round(score_ms, 2),
        "per_pair_encode_ms": round(encode_ms / max(len(examples), 1), 3),
    }


def run(models: Sequence[str], dataset_path: Path | None) -> None:
    examples = _load_examples(dataset_path)
    if not examples:
        raise ValueError("No examples found for benchmarking.")

    print(f"Loaded {len(examples)} labeled pairs")
    if dataset_path:
        print(f"Dataset: {dataset_path}")
    else:
        print("Dataset: built-in seed examples")
    print("")

    results = []
    for model_name in models:
        print(f"Evaluating: {model_name}")
        result = evaluate_model(model_name, examples)
        results.append(result)
        print(
            f"  acc={result['accuracy']}, thr={result['best_threshold']}, "
            f"enc={result['encode_ms']} ms, avg+={result['avg_positive_cosine']}, "
            f"avg-={result['avg_negative_cosine']}"
        )
        print("")

    results.sort(key=lambda x: (x["accuracy"], -x["encode_ms"]), reverse=True)
    print("=== Ranked Results (higher accuracy first) ===")
    for i, r in enumerate(results, start=1):
        print(
            f"{i}. {r['model']} | acc={r['accuracy']} | thr={r['best_threshold']} | "
            f"encode={r['encode_ms']}ms | per_pair={r['per_pair_encode_ms']}ms"
        )


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Benchmark embedding models for similarity quality and speed.")
    parser.add_argument(
        "--models",
        nargs="*",
        default=DEFAULT_MODELS,
        help="Model names to benchmark. Defaults to 3 candidates.",
    )
    parser.add_argument(
        "--dataset",
        type=str,
        default=None,
        help="Path to JSON file: [{\"text_a\":..., \"text_b\":..., \"label\":0|1}, ...]",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    dataset_path = Path(args.dataset).resolve() if args.dataset else None
    run(args.models, dataset_path)
