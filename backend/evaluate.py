"""
NSU PlagiChecker - Evaluation Script
=====================================
Terminal theke run koro:
    cd backend
    python evaluate.py

Ki dekhabe:
  1. Model load status + device (GPU/CPU)
  2. Sentence-pair similarity accuracy (known plagiarism vs original)
  3. Paraphrase detection test
  4. Lexical / Fingerprint / Winnowing scores breakdown
  5. Large paragraph vs query sentences - top matches table
"""

import sys
import os
import time

# Fix Windows terminal Unicode encoding
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

# ── colour helpers (no dependency) ──────────────────────────────────────────
RED    = "\033[91m"
GREEN  = "\033[92m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
DIM    = "\033[2m"
RESET  = "\033[0m"

def c(text, colour): return f"{colour}{text}{RESET}"
def bar(val, width=28):
    filled = int(round(val * width))
    b = "#" * filled + "-" * (width - filled)
    return c(b[:filled], GREEN) + c(b[filled:], DIM)

def section(title):
    print()
    print(c("=" * 62, CYAN))
    print(c(f"  {title}", BOLD + CYAN))
    print(c("=" * 62, CYAN))

def row(label, val, threshold=0.60):
    pct = f"{val*100:5.1f}%"
    colour = GREEN if val >= threshold else (YELLOW if val >= threshold * 0.7 else RED)
    print(f"  {label:<40} {bar(val, 20)} {c(pct, colour)}")

# ── test data ────────────────────────────────────────────────────────────────

# (query, reference, expected_label)
# label: "plagiarism" → high similarity expected; "original" → low expected
SENTENCE_PAIRS = [
    # ── Direct copy ──────────────────────────────────────────────────────────
    (
        "Machine learning algorithms learn patterns from data without being explicitly programmed.",
        "Machine learning algorithms learn patterns from data without being explicitly programmed.",
        "plagiarism",   # exact copy → ~1.00
    ),
    # ── Heavy paraphrase ─────────────────────────────────────────────────────
    (
        "Deep learning models require large amounts of training data to achieve high accuracy.",
        "Neural networks with many layers need enormous datasets to reach strong performance.",
        "plagiarism",   # same idea, different words → should still be flagged
    ),
    # ── Moderate paraphrase ──────────────────────────────────────────────────
    (
        "The results indicate a significant improvement in classification accuracy using the proposed method.",
        "Our approach shows a notable increase in how well the model classifies samples.",
        "plagiarism",
    ),
    # ── Unrelated sentences ──────────────────────────────────────────────────
    (
        "The weather in Dhaka is hot and humid during the monsoon season.",
        "Quantum computing uses qubits to perform calculations faster than classical computers.",
        "original",     # completely different topics → should be low
    ),
    (
        "Students must submit their assignments before the deadline to avoid penalty.",
        "The history of the Ottoman Empire spans several centuries across three continents.",
        "original",
    ),
    # ── Academic writing paraphrase ──────────────────────────────────────────
    (
        "This paper proposes a novel approach to natural language processing using transformer models.",
        "We introduce a new method for NLP tasks based on transformer architecture.",
        "plagiarism",
    ),
    # ── Slight rewording ─────────────────────────────────────────────────────
    (
        "The algorithm was tested on a benchmark dataset and achieved 95% accuracy.",
        "The method was evaluated on a standard dataset, obtaining an accuracy of 95 percent.",
        "plagiarism",
    ),
    # ── Topic overlap but genuinely different ────────────────────────────────
    (
        "Convolutional neural networks are widely used for image classification tasks.",
        "Recurrent neural networks are designed to handle sequential data like time series.",
        "original",     # both are about neural networks but different topic
    ),
]

# Large reference paragraph (simulating a PDF document)
REFERENCE_PARAGRAPH = """
Artificial intelligence and machine learning have transformed the way computers process information.
Deep learning, a subset of machine learning, uses multi-layer neural networks to learn representations
of data with multiple levels of abstraction. These models have achieved remarkable success in image
recognition, natural language processing, and speech synthesis. Convolutional neural networks (CNNs)
are especially effective at processing visual data by applying learned filters across the input image.
Recurrent neural networks (RNNs) and transformers have revolutionized natural language processing
by capturing sequential dependencies in text. Transfer learning allows models pre-trained on large
datasets to be fine-tuned for specific tasks with limited data. The attention mechanism, central to
transformer models like BERT and GPT, enables the model to weigh the importance of different input
tokens dynamically. Despite these advances, challenges remain in areas such as model interpretability,
data efficiency, robustness to adversarial attacks, and ethical deployment of AI systems.
"""

# Query sentences to match against the reference paragraph
QUERY_SENTENCES = [
    "Deep learning uses neural networks with many layers to learn complex data representations.",
    "The attention mechanism allows transformer models to focus on the most relevant parts of the input.",
    "CNNs apply learned filters to visual data for image recognition tasks.",
    "The capital of Bangladesh is Dhaka and it is one of the most densely populated cities.",  # unrelated
    "Transfer learning enables reuse of pre-trained models for new tasks with less data.",
    "AI systems face challenges in interpretability and robustness to adversarial inputs.",
]

# ── main evaluation ───────────────────────────────────────────────────────────

def main():
    print()
    print(c("=" * 62, CYAN))
    print(c("     NSU PlagiChecker - Similarity Evaluation Report      ", BOLD + CYAN))
    print(c("=" * 62, CYAN))

    # ── 1. Load model ────────────────────────────────────────────────────────
    section("1 ▸ Loading Embedding Model")
    t0 = time.perf_counter()
    try:
        from embedding_pipeline import (
            encode_chunks, cosine_similarity,
            lexical_similarity, fingerprint_similarity, winnowing_similarity,
            DEVICE, AVAILABLE_MODELS, DEFAULT_MODEL_NAME,
        )
        load_time = time.perf_counter() - t0
        model_label = AVAILABLE_MODELS[DEFAULT_MODEL_NAME]["label"]
        model_id    = AVAILABLE_MODELS[DEFAULT_MODEL_NAME]["model_id"]
        print(f"  Model    : {c(model_id, BOLD)}")
        print(f"  Label    : {model_label}")
        print(f"  Device   : {c(DEVICE.upper(), GREEN if DEVICE != 'cpu' else YELLOW)}")
        print(f"  Load time: {c(f'{load_time:.2f}s', CYAN)}")
    except Exception as e:
        print(c(f"  [ERROR] Could not load model: {e}", RED))
        print(c("  Make sure you are running from the backend/ directory", YELLOW))
        print(c("  and the virtual environment is activated.", YELLOW))
        sys.exit(1)

    # ── 2. Encode all test sentences ─────────────────────────────────────────
    section("2 ▸ Sentence-Pair Similarity (Accuracy Test)")

    all_queries = [p[0] for p in SENTENCE_PAIRS]
    all_refs    = [p[1] for p in SENTENCE_PAIRS]

    t1 = time.perf_counter()
    q_embs = encode_chunks(all_queries)
    r_embs = encode_chunks(all_refs)
    enc_time = time.perf_counter() - t1
    print(f"  Encoded {len(SENTENCE_PAIRS)*2} sentences in {c(f'{enc_time:.2f}s', CYAN)}")
    print()

    header = f"  {'#':<3} {'Expected':<12} {'Semantic':>9} {'Lexical':>9} {'Fingerprint':>12} {'Result'}"
    print(c(header, DIM))
    print(c("  " + "─"*72, DIM))

    correct = 0
    THRESHOLD = 0.60   # same as DEFAULT_SEMANTIC_THRESHOLD in embedding_pipeline
    for i, (q, ref, label) in enumerate(SENTENCE_PAIRS):
        sem = cosine_similarity(q_embs[i], r_embs[i])
        lex = lexical_similarity(q, ref)
        fp  = fingerprint_similarity(q, ref)
        predicted = "plagiarism" if sem >= THRESHOLD else "original"
        ok = predicted == label
        if ok:
            correct += 1
        result_str = c("CORRECT", GREEN) if ok else c("WRONG  ", RED)
        sem_str = c(f"{sem*100:5.1f}%", GREEN if sem >= THRESHOLD else RED)
        lex_str = c(f"{lex*100:5.1f}%", CYAN)
        fp_str  = c(f"{fp*100:5.1f}%",  CYAN)
        exp_str = c(label, YELLOW)
        print(f"  {i+1:<3} {exp_str:<22} {sem_str:>18} {lex_str:>18} {fp_str:>21}   {result_str}")

    accuracy = correct / len(SENTENCE_PAIRS)
    print()
    print(f"  Accuracy : {c(f'{correct}/{len(SENTENCE_PAIRS)}', BOLD)} pairs correct  →  {c(f'{accuracy*100:.1f}%', GREEN if accuracy >= 0.75 else RED)}")

    # ── 3. Similarity metric breakdown ───────────────────────────────────────
    section("3 ▸ Score Breakdown per Pair")
    for i, (q, ref, label) in enumerate(SENTENCE_PAIRS):
        sem  = cosine_similarity(q_embs[i], r_embs[i])
        lex  = lexical_similarity(q, ref)
        fp   = fingerprint_similarity(q, ref)
        win  = winnowing_similarity(q, ref)
        comb = (0.60 * sem) + (0.15 * lex) + (0.15 * win) + (0.10 * fp)
        tag  = c("[PLAG]", RED) if label == "plagiarism" else c("[ORIG]", GREEN)
        print(f"\n  Pair {i+1} {tag}  {c(q[:65]+'…' if len(q)>65 else q, DIM)}")
        row("  Semantic (cosine)",   sem,  0.60)
        row("  Lexical (Jaccard)",   lex,  0.08)
        row("  Fingerprint (n-gram)", fp,  0.05)
        row("  Winnowing (MOSS)",    win,  0.05)
        row("  Combined score",      comb, 0.40)

    # ── 4. Large paragraph vs query sentences ────────────────────────────────
    section("4 ▸ PDF Paragraph vs Query Sentences (Top-Match Detection)")
    print(f"  Reference : {c(str(len(REFERENCE_PARAGRAPH.split()))+ ' words', CYAN)} paragraph")
    print(f"  Queries   : {c(str(len(QUERY_SENTENCES)), CYAN)} test sentences")
    print()

    # Chunk the paragraph into sentences for comparison
    import re
    ref_sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', REFERENCE_PARAGRAPH.strip()) if len(s.strip()) > 20]

    t2 = time.perf_counter()
    q_embs2   = encode_chunks(QUERY_SENTENCES)
    ref_embs2 = encode_chunks(ref_sentences)
    enc2_time = time.perf_counter() - t2

    print(f"  Encoded {len(QUERY_SENTENCES)} queries + {len(ref_sentences)} ref sentences in {c(f'{enc2_time:.2f}s', CYAN)}")
    print()

    col_q   = "Query Sentence"
    col_r   = "Best Matching Sentence in Reference"
    col_s   = "Sim"
    print(c(f"  {'#':<3} {col_s:<6} {'Query (truncated)':<45} {'Best Match (truncated)'}", DIM))
    print(c("  " + "─"*110, DIM))

    for qi, (q_text, q_emb) in enumerate(zip(QUERY_SENTENCES, q_embs2)):
        best_sem   = -1.0
        best_ref   = ""
        for rj, (r_text, r_emb) in enumerate(zip(ref_sentences, ref_embs2)):
            sem = cosine_similarity(q_emb, r_emb)
            if sem > best_sem:
                best_sem = sem
                best_ref = r_text

        colour = GREEN if best_sem >= THRESHOLD else (YELLOW if best_sem >= 0.40 else RED)
        sim_str = c(f"{best_sem*100:.1f}%", colour)
        flag    = c(" << MATCH", RED) if best_sem >= THRESHOLD else ""
        q_short = (q_text[:43] + "…") if len(q_text) > 43 else q_text
        r_short = (best_ref[:48] + "…") if len(best_ref) > 48 else best_ref
        print(f"  {qi+1:<3} {sim_str:<15} {c(q_short, BOLD):<54} {c(r_short, DIM)}{flag}")

    # ── 5. Summary ───────────────────────────────────────────────────────────
    section("5 ▸ Summary")
    matched_pairs  = sum(1 for i in range(len(SENTENCE_PAIRS))
                         if cosine_similarity(q_embs[i], r_embs[i]) >= THRESHOLD
                         and SENTENCE_PAIRS[i][2] == "plagiarism")
    total_plag     = sum(1 for _, _, l in SENTENCE_PAIRS if l == "plagiarism")
    total_orig     = sum(1 for _, _, l in SENTENCE_PAIRS if l == "original")
    false_pos      = sum(1 for i in range(len(SENTENCE_PAIRS))
                         if cosine_similarity(q_embs[i], r_embs[i]) >= THRESHOLD
                         and SENTENCE_PAIRS[i][2] == "original")

    print(f"  Total pairs tested  : {c(str(len(SENTENCE_PAIRS)), BOLD)}")
    print(f"  Plagiarism pairs    : {c(str(total_plag), YELLOW)}")
    print(f"  Original pairs      : {c(str(total_orig), GREEN)}")
    print(f"  Correctly detected  : {c(str(correct), GREEN)}")
    print(f"  False positives     : {c(str(false_pos), RED)}")
    print(f"  Overall Accuracy    : {c(f'{accuracy*100:.1f}%', GREEN if accuracy >= 0.75 else RED)}")
    print()

    if accuracy >= 0.875:
        print(c("  [PASS] Model is performing WELL on this test set.", GREEN + BOLD))
    elif accuracy >= 0.625:
        print(c("  [WARN] Model is performing ACCEPTABLY - some edge cases missed.", YELLOW + BOLD))
    else:
        print(c("  [FAIL] Model needs improvement - too many misclassifications.", RED + BOLD))

    print()
    print(c("  Done. All tests completed successfully.", CYAN))
    print()


if __name__ == "__main__":
    main()
