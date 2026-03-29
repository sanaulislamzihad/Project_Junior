import os
import re
from difflib import SequenceMatcher
from typing import Any, Dict, List, Tuple

try:
    import fitz
except ImportError:
    fitz = None

from embedding_pipeline import fingerprint_similarity, lexical_similarity
from text_pipeline import clean_text


def _require_pymupdf() -> Any:
    if fitz is None:
        raise ImportError("PyMuPDF is required for PDF highlighting. Install with: pip install PyMuPDF")
    return fitz


def _normalize_sentence(text: str) -> str:
    cleaned = clean_text(text or "")
    cleaned = cleaned.replace("\u00ad", "")
    cleaned = re.sub(r"[\r\n\t]+", " ", cleaned)
    cleaned = re.sub(r"[^\w\s]", " ", cleaned.lower())
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.strip()


def _normalize_word(text: str) -> str:
    text = (text or "").replace("\u00ad", "")
    text = re.sub(r"[^\w]", "", text.lower())
    return text.strip()


def _split_sentences(text: str) -> List[str]:
    collapsed = re.sub(r"\s+", " ", text or "").strip()
    if not collapsed:
        return []
    parts = re.split(r"(?<=[.!?])\s+|\s+(?=(?:\(\d+\)|\d+[.)]|[-*])\s+)", collapsed)
    return [part.strip() for part in parts if len(_normalize_sentence(part).split()) >= 4]


def extract_pdf_sentences_with_bboxes(pdf_path: str) -> List[Dict]:
    """Extract sentence candidates with their source page/block boxes."""
    rows: List[Dict] = []
    pymupdf = _require_pymupdf()
    with pymupdf.open(pdf_path) as doc:
        for page_index, page in enumerate(doc):
            blocks = page.get_text("blocks", sort=True) or []
            for block in blocks:
                if len(block) < 5:
                    continue
                x0, y0, x1, y1, text = block[:5]
                if not text or not text.strip():
                    continue
                for sentence in _split_sentences(text):
                    normalized = _normalize_sentence(sentence)
                    if not normalized:
                        continue
                    rows.append(
                        {
                            "page_number": page_index + 1,
                            "bbox": (float(x0), float(y0), float(x1), float(y1)),
                            "text": sentence.strip(),
                            "normalized_text": normalized,
                        }
                    )
    return rows


def _rank_sentence_candidate(query_sentence: str, candidate: Dict) -> Tuple[float, float, float, float]:
    candidate_text = candidate["normalized_text"]
    query_norm = _normalize_sentence(query_sentence)
    lexical = lexical_similarity(query_norm, candidate_text)
    ngram = fingerprint_similarity(query_norm, candidate_text)
    sequence = SequenceMatcher(a=query_norm, b=candidate_text, autojunk=False).ratio()
    score = (0.5 * ngram) + (0.3 * lexical) + (0.2 * sequence)
    return score, lexical, ngram, sequence


def _expand_clip(page: Any, bbox: Tuple[float, float, float, float], padding: float = 10.0) -> Any:
    pymupdf = _require_pymupdf()
    rect = pymupdf.Rect(bbox)
    clip = pymupdf.Rect(
        max(page.rect.x0, rect.x0 - padding),
        max(page.rect.y0, rect.y0 - padding),
        min(page.rect.x1, rect.x1 + padding),
        min(page.rect.y1, rect.y1 + padding),
    )
    return clip


def _split_highlight_targets(text: str) -> List[str]:
    """Split long numbered / bulleted runs into smaller locatable highlight targets."""
    cleaned = re.sub(r"\s+", " ", text or "").strip()
    if not cleaned:
        return []
    parts = re.split(r"(?=\b\d+[.)]\s+)|(?=(?:^|\s)[-*]\s+)", cleaned)
    targets = [part.strip() for part in parts if len(_normalize_sentence(part).split()) >= 4]
    return targets or [cleaned]


def locate_matched_sentences(pdf_sentences: List[Dict], matches: List[Dict]) -> List[Dict]:
    """Map verified semantic matches back to sentences extracted from the original PDF."""
    located: List[Dict] = []
    seen = set()

    for match_index, match in enumerate(matches or []):
        for sentence_index, sentence_match in enumerate(match.get("similar_sentences") or []):
            query_sentence = (sentence_match.get("query_sentence") or "").strip()
            repo_sentence = (sentence_match.get("matched_sentence") or "").strip()
            if not query_sentence:
                continue

            for target in _split_highlight_targets(query_sentence):
                best = None
                best_score = 0.0
                best_lexical = 0.0
                best_ngram = 0.0
                best_sequence = 0.0
                for candidate in pdf_sentences:
                    score, lexical, ngram, sequence = _rank_sentence_candidate(target, candidate)
                    if score > best_score:
                        best = candidate
                        best_score = score
                        best_lexical = lexical
                        best_ngram = ngram
                        best_sequence = sequence

                if best is None:
                    continue
                if best_lexical < 0.45 and best_ngram < 0.18 and best_sequence < 0.72:
                    continue

                key = (best["page_number"], best["normalized_text"])
                if key in seen:
                    continue
                seen.add(key)
                located.append(
                    {
                        "page_number": best["page_number"],
                        "bbox": best["bbox"],
                        "match_index": match_index,
                        "sentence_index": sentence_index,
                        "pdf_sentence": best["text"],
                        "query_sentence": target,
                        "matched_sentence": repo_sentence,
                        "matched_file_name": match.get("file_name"),
                        "semantic_similarity": sentence_match.get("semantic_similarity"),
                        "lexical_similarity": sentence_match.get("lexical_similarity"),
                        "ngram_similarity": round(float(best_ngram), 4),
                        "sequence_similarity": round(float(best_sequence), 4),
                    }
                )
    return located


def _sentence_search_queries(text: str) -> List[str]:
    queries: List[str] = []

    def add_query(value: str) -> None:
        value = re.sub(r"\s+", " ", value or "").strip()
        if len(value) < 12:
            return
        if value not in queries:
            queries.append(value)

    add_query(text)
    cleaned = clean_text(text or "")
    add_query(cleaned)

    words = cleaned.split()
    if len(words) >= 6:
        window = min(12, len(words))
        step = max(4, window // 2)
        for start in range(0, len(words), step):
            segment = words[start:start + window]
            if len(segment) >= 6:
                add_query(" ".join(segment))

    for fragment in re.split(r"[,;:]\s+", cleaned):
        add_query(fragment)

    return queries


def _dedupe_regions(regions: List[Any]) -> List[Any]:
    pymupdf = _require_pymupdf()
    unique: List[Any] = []
    seen = set()
    for region in regions:
        rect = pymupdf.Rect(region.rect if hasattr(region, "rect") else region)
        key = tuple(round(v, 2) for v in (rect.x0, rect.y0, rect.x1, rect.y1))
        if key in seen:
            continue
        seen.add(key)
        unique.append(region)
    return unique


def _region_to_bbox(region: Any) -> Tuple[float, float, float, float]:
    pymupdf = _require_pymupdf()
    rect = pymupdf.Rect(region.rect if hasattr(region, "rect") else region)
    return (float(rect.x0), float(rect.y0), float(rect.x1), float(rect.y1))


def _search_sentence_quads(page: Any, sentence: str, clip: Any = None) -> List[Any]:
    queries = _sentence_search_queries(sentence)
    if not queries:
        return []

    # Try exact / full-sentence queries first.
    for query in queries[:2]:
        hits = page.search_for(query, quads=True, clip=clip)
        if hits:
            return _dedupe_regions(hits)

    quads: List[Any] = []
    for query in queries[2:]:
        hits = page.search_for(query, quads=True, clip=clip)
        if hits:
            quads.extend(hits)
    return _dedupe_regions(quads)


def _extract_words(page: Any, clip: Any) -> List[Dict]:
    words = page.get_text("words", clip=clip, sort=True) or []
    rows: List[Dict] = []
    for word in words:
        if len(word) < 8:
            continue
        x0, y0, x1, y1, text, block_no, line_no, word_no = word[:8]
        normalized = _normalize_word(text)
        if not normalized:
            continue
        rows.append(
            {
                "rect": (float(x0), float(y0), float(x1), float(y1)),
                "text": text,
                "norm": normalized,
                "block_no": int(block_no),
                "line_no": int(line_no),
                "word_no": int(word_no),
            }
        )
    return rows


def _merge_word_rects(words: List[Dict]) -> List[Any]:
    pymupdf = _require_pymupdf()
    if not words:
        return []
    rects: List[Any] = []
    current = None
    current_line = None
    for word in words:
        rect = pymupdf.Rect(word["rect"])
        line_key = (word["block_no"], word["line_no"])
        if current is None:
            current = rect
            current_line = line_key
            continue
        same_line = line_key == current_line
        small_gap = rect.x0 - current.x1 <= 8
        if same_line and small_gap:
            current.x1 = max(current.x1, rect.x1)
            current.y0 = min(current.y0, rect.y0)
            current.y1 = max(current.y1, rect.y1)
        else:
            rects.append(current)
            current = rect
            current_line = line_key
    if current is not None:
        rects.append(current)
    return _dedupe_regions(rects)


def _find_best_word_window_rects(page: Any, sentence: str, clip: Any) -> List[Any]:
    words = _extract_words(page, clip)
    if not words:
        return []
    target_tokens = [token for token in _normalize_sentence(sentence).split() if token]
    if not target_tokens:
        return []

    target_len = len(target_tokens)
    min_window = max(2, target_len - 4)
    max_window = min(len(words), target_len + 6)
    best_score = 0.0
    best_words: List[Dict] = []
    target_text = " ".join(target_tokens)

    for start in range(len(words)):
        upper = min(len(words), start + max_window)
        lower = start + min_window
        if lower > upper:
            continue
        for end in range(lower, upper + 1):
            window_words = words[start:end]
            window_text = " ".join(word["norm"] for word in window_words)
            if not window_text:
                continue
            lexical = lexical_similarity(target_text, window_text)
            ngram = fingerprint_similarity(target_text, window_text)
            sequence = SequenceMatcher(a=target_text, b=window_text, autojunk=False).ratio()
            length_penalty = abs(len(window_words) - target_len) * 0.01
            score = (0.5 * ngram) + (0.25 * lexical) + (0.25 * sequence) - length_penalty
            if score > best_score:
                best_score = score
                best_words = window_words

    if best_score < 0.6:
        return []
    return _merge_word_rects(best_words)


def _locate_sentence_regions(page: Any, row: Dict) -> List[Any]:
    clip = _expand_clip(page, row["bbox"])

    quads = _search_sentence_quads(page, row["pdf_sentence"], clip=clip)
    if quads:
        return quads

    quads = _search_sentence_quads(page, row["query_sentence"], clip=clip)
    if quads:
        return quads

    rects = _find_best_word_window_rects(page, row["pdf_sentence"], clip)
    if rects:
        return rects

    rects = _find_best_word_window_rects(page, row["query_sentence"], clip)
    if rects:
        return rects

    return []


def highlight_pdf_matches(input_pdf_path: str, matches: List[Dict], output_pdf_path: str) -> Dict:
    """
    Annotate the uploaded PDF in-place by locating matched sentences on the original pages.
    Layout, images, tables, and formatting remain unchanged because only highlight annotations are added.
    """
    output_dir = os.path.dirname(output_pdf_path)
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)
    pymupdf = _require_pymupdf()

    extracted_sentences = extract_pdf_sentences_with_bboxes(input_pdf_path)
    located_sentences = locate_matched_sentences(extracted_sentences, matches)
    annotation_count = 0
    highlight_count = 0

    with pymupdf.open(input_pdf_path) as doc:
        for row in located_sentences:
            page = doc[row["page_number"] - 1]
            regions = _locate_sentence_regions(page, row)
            if not regions:
                continue
            row["regions"] = [_region_to_bbox(region) for region in regions]

            for region in regions:
                annot = page.add_highlight_annot(region)
                if annot is None:
                    continue
                annot.set_colors(stroke=(1.0, 0.92, 0.25))
                annot.update(opacity=0.35)
                annotation_count += 1
            highlight_count += 1

        doc.save(output_pdf_path, garbage=4, deflate=True)

    return {
        "output_path": output_pdf_path,
        "located_sentence_count": len(located_sentences),
        "highlight_count": highlight_count,
        "annotation_count": annotation_count,
        "located_sentences": located_sentences,
    }
