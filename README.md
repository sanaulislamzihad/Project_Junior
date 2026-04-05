# NSU PlagiChecker

Full-stack plagiarism and semantic similarity checker with:
- FastAPI backend
- React + Vite frontend
- FAISS Top-K retrieval
- N-gram fingerprint verification
- Diff comparison endpoint

## Prerequisites

- Python 3.10+ (recommended)
- Node.js 18+ and npm
- Windows PowerShell / terminal

## Project Setup

Run from project root:

```bash
cd Project_Junior-master
```

### 1) Backend install

Create and activate a virtual environment (recommended):

```bash
python -m venv .venv
.\.venv\Scripts\activate
```

Install backend dependencies:

```bash
pip install -r backend/requirements.txt
```

### 2) Frontend install

In a second terminal (project root), install frontend dependencies:

```bash
npm install
```

## Run the app

### Terminal A - start backend

```bash
cd backend
python main.py
```

Backend runs on:
- `http://localhost:8000`

### Terminal B - start frontend

From project root:

```bash
npm run dev
```

Frontend runs on:
- `http://localhost:5173`

## Optional commands

- Frontend production build:
  ```bash
  npm run build
  ```
- Backend quick health check:
  - Open `http://localhost:8000/` in browser

---

## Similarity Scoring System — How It Works

NSU PlagiChecker uses a **multi-layer, multi-algorithm** approach to detect both exact copying and paraphrased plagiarism. Below is a complete explanation of every score reported by the system.

---

### 1. Embedding Model

| Property | Value |
|---|---|
| Model | `sentence-transformers/all-mpnet-base-v2` |
| Vector Dimension | 768 |
| Source | Hugging Face / SBERT |
| Strength | State-of-the-art on MTEB benchmark; captures deep semantic meaning |

The model converts each text chunk into a 768-dimensional vector. Similar meanings produce vectors that point in similar directions, even when the exact words are completely different.

---

### 2. Individual Similarity Algorithms

The system uses **four independent algorithms**, each detecting a different type of similarity:

#### a) Semantic Similarity (Cosine Similarity)

| Aspect | Detail |
|---|---|
| What it measures | **Meaning similarity** — do two texts say the same thing? |
| How it works | Text → 768-dim vector via `all-mpnet-base-v2` → cosine of angle between vectors |
| Range | 0.0 (completely unrelated) to 1.0 (identical meaning) |
| Catches | Paraphrasing, rewriting, sentence restructuring, synonym substitution |

**Formula:**

```
cosine_similarity = dot(A, B) / (||A|| × ||B||)
```

**Example:**
- "The student submitted the weekly report" vs "Weekly report was submitted by the student" → **~0.92** (high semantic, same meaning)
- "Neural networks detect patterns" vs "The weather is sunny today" → **~0.08** (low, unrelated topics)

#### b) Lexical Similarity (Jaccard Word Overlap)

| Aspect | Detail |
|---|---|
| What it measures | **Exact word overlap** — how many words are shared? |
| How it works | Tokenize both texts into word sets → Jaccard = \|intersection\| / \|union\| |
| Range | 0.0 (no shared words) to 1.0 (identical word sets) |
| Catches | Direct copy-paste, minor word reordering, light editing |

**Formula:**

```
jaccard = |words_A ∩ words_B| / |words_A ∪ words_B|
```

**Example:**
- "machine learning is powerful" vs "machine learning is very powerful" → **~0.80**
- "the cat sat on the mat" vs "quantum physics research paper" → **0.00**

#### c) Fingerprint Similarity (Character N-gram Hashing)

| Aspect | Detail |
|---|---|
| What it measures | **Character-level structural overlap** |
| How it works | Extract character 5-grams → SHA-1 hash each → Jaccard over hashed fingerprints |
| Range | 0.0 (no overlap) to 1.0 (identical structure) |
| Catches | Partial copy-paste, sentence fragments copied verbatim, minor character edits |

This is more fine-grained than word-level Jaccard because it catches sub-word patterns and exact phrase fragments.

#### d) Winnowing Similarity (Stanford MOSS Algorithm)

| Aspect | Detail |
|---|---|
| What it measures | **Document fingerprint overlap** using the Winnowing algorithm |
| How it works | Remove whitespace → k-gram hashes → sliding window selects minimum hash → Jaccard over fingerprints |
| Range | 0.0 to 1.0 |
| Catches | Code/text plagiarism that preserves structure; used in Stanford MOSS plagiarism detection |
| Parameters | k=5 (gram size), w=4 (window size) |

Winnowing is the same algorithm used by **Stanford MOSS** (Measure of Software Similarity), a widely-used plagiarism detection system in universities.

---

### 3. Combined Similarity Score (Per Chunk)

Each text chunk gets a **combined score** that blends all four algorithms with carefully tuned weights:

```
Combined = (0.60 × Semantic) + (0.15 × Lexical) + (0.15 × Winnowing) + (0.10 × Fingerprint)
```

| Algorithm | Weight | Why This Weight |
|---|---|---|
| Semantic (AI) | **60%** | Primary detector — catches paraphrasing that other methods miss |
| Lexical (Jaccard) | **15%** | Rewards exact word overlap as supporting evidence |
| Winnowing (MOSS) | **15%** | Catches structural copying patterns |
| Fingerprint (N-gram) | **10%** | Fine-grained character-level verification |

Semantic similarity gets the highest weight because plagiarism often involves rewriting — changing words while keeping the same meaning. Lexical and structural methods serve as **verification layers** that boost confidence when exact copying is present.

---

### 4. Overall Similarity Percentage (Final Score)

The final percentage displayed to the user is calculated as:

```
Overall % = Match Rate × Average Quality × 100
```

Where:
- **Match Rate** = (number of query chunks that found a match) / (total query chunks)
- **Average Quality** = average combined similarity of matched chunks only

| Overall Score | Interpretation | Color |
|---|---|---|
| **0% – 29%** | **LOW SIMILARITY** — Document appears mostly original | Green |
| **30% – 59%** | **MODERATE SIMILARITY** — Some sections match existing documents; review recommended | Orange |
| **60% – 100%** | **HIGH SIMILARITY** — Significant overlap detected; requires careful review | Red |

**Important:** A high similarity score does **not** automatically mean plagiarism. Common phrases, quotations, references, and standard technical terminology can produce matches. The score indicates *how much* text overlaps — a human reviewer decides *whether* it constitutes plagiarism.

---

### 5. Sentence-Level Analysis

Beyond chunk-level comparison, the system drills down to **individual sentences** to pinpoint exactly which parts matched:

#### Sentence-Level Matching Criteria

A sentence pair is reported as a match if **either** condition is true:

| Condition | Thresholds | What It Catches |
|---|---|---|
| **High semantic** | Semantic ≥ 0.50 | Paraphrased sentences (different words, same meaning) |
| **High lexical + fingerprint** | Lexical ≥ 0.05 AND Fingerprint ≥ 0.08 | Direct copies with minor edits |

Plus a minimum semantic floor of **0.35** to filter out pure keyword coincidences.

#### Sentence Ranking Score

```
Sentence Score = (0.75 × Semantic) + (0.20 × Lexical) + (0.05 × Chunk Average)
```

The top-scoring sentences are shown in the report as **"Top Similar Sentences"** — these are the most likely plagiarized portions of the document.

---

### 6. Detection Thresholds Summary

| Threshold | Level | Value | Purpose |
|---|---|---|---|
| Semantic Threshold | Chunk | **0.60** | Minimum cosine similarity to consider a chunk match |
| Lexical Threshold | Chunk | **0.08** | Minimum word overlap to pass |
| Fingerprint Threshold | Chunk | **0.05** | Minimum n-gram overlap to pass |
| Semantic Threshold | Sentence | **0.50** | Minimum for sentence-level match |
| Lexical Threshold | Sentence | **0.05** | Minimum for sentence-level match |
| Semantic Floor | Sentence | **0.35** | Hard minimum to avoid false positives |
| High Semantic Override | Chunk | **0.72** | Report match even without sentence evidence (heavy paraphrase) |

A chunk must pass **all three** chunk-level thresholds (semantic AND lexical AND fingerprint) to be considered a match. This triple-gate design minimizes false positives.

---

### 7. FAISS Vector Search (Speed Optimization)

| Property | Value |
|---|---|
| Index Type | `IndexFlatIP` (exact inner product) |
| Normalization | L2-normalized vectors → inner product = cosine similarity |
| Top-K | 50 nearest neighbors per query chunk |
| Activation | When repository has ≥ 20 chunks |
| GPU Support | Automatic (CUDA if available) |

For small repositories (< 20 chunks), brute-force comparison is used. For larger repositories, **FAISS** (Facebook AI Similarity Search) provides fast nearest-neighbor lookup without sacrificing accuracy.

---

### 8. Score Interpretation Examples

| Scenario | Semantic | Lexical | Combined | Interpretation |
|---|---|---|---|---|
| Exact copy-paste | 0.98 | 0.95 | ~0.95 | Direct plagiarism — text copied verbatim |
| Light paraphrase | 0.85 | 0.40 | ~0.62 | Sentence restructured with some word changes |
| Heavy paraphrase | 0.72 | 0.10 | ~0.48 | Meaning preserved but extensively rewritten |
| Same topic, original | 0.55 | 0.15 | ~0.40 | Similar subject matter but independently written |
| Unrelated content | 0.15 | 0.02 | ~0.10 | No meaningful overlap |

---

### 9. Analysis Pipeline Flow

```
Upload Document
    │
    ▼
Extract Text (PyMuPDF / pdfplumber)
    │
    ▼
Split into Chunks (150 words, 20-word overlap)
    │
    ▼
Generate Embeddings (all-mpnet-base-v2, 768-dim)
    │
    ▼
Search Repository (FAISS Top-50 or Brute-force)
    │
    ▼
Compute 4 Similarity Scores per Chunk Pair
(Semantic + Lexical + Fingerprint + Winnowing)
    │
    ▼
Apply Thresholds → Filter Matches
    │
    ▼
Drill Down: Sentence-Level Matching
    │
    ▼
Aggregate → Overall Similarity %
    │
    ▼
Generate Report (PDF with highlights)
```

---

## Notes

- Keep both backend and frontend running during use.
- If `vite` is not recognized, run `npm install` again in project root.
- If sentence-transformer model download is slow, retry once; first run can take longer.
