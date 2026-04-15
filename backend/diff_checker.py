"""
Document Comparison – word-level diff between source & suspect PDFs.
Extra/added text in the suspect is highlighted in yellow.
"""
import difflib
import os
import re
import shutil
from typing import Any, Dict, List, Tuple

try:
    import fitz
except ImportError:
    fitz = None


def _require_pymupdf():
    if fitz is None:
        raise ImportError("PyMuPDF required – pip install PyMuPDF")
    return fitz


def _norm(text: str) -> str:
    return re.sub(r"[^\w]", "", (text or "").lower()).strip()


def extract_pdf_text(pdf_path: str) -> Tuple[str, int]:
    """Return (full_text, page_count) from a PDF."""
    pymupdf = _require_pymupdf()
    parts = []
    with pymupdf.open(pdf_path) as doc:
        page_count = len(doc)
        for page in doc:
            parts.append(page.get_text("text") or "")
    return "\n".join(parts), page_count


def extract_words_with_positions(pdf_path: str) -> List[Dict]:
    """Extract every word from a PDF with page index and bounding box."""
    pymupdf = _require_pymupdf()
    words = []
    with pymupdf.open(pdf_path) as doc:
        for page_idx, page in enumerate(doc):
            for w in (page.get_text("words", sort=True) or []):
                if len(w) < 8:
                    continue
                x0, y0, x1, y1, text, block_no, line_no, word_no = w[:8]
                normalized = _norm(text)
                if not normalized:
                    continue
                words.append({
                    "page": page_idx,
                    "rect": (float(x0), float(y0), float(x1), float(y1)),
                    "text": text,
                    "norm": normalized,
                    "block_no": int(block_no),
                    "line_no": int(line_no),
                    "word_no": int(word_no),
                })
    return words


def find_extra_indices(source_norms: List[str], suspect_norms: List[str]) -> List[int]:
    """Return indices of words in suspect that are extra (insert / replace vs source)."""
    sm = difflib.SequenceMatcher(None, source_norms, suspect_norms, autojunk=False)
    extras = set()
    for op, _i1, _i2, j1, j2 in sm.get_opcodes():
        if op in ("insert", "replace"):
            extras.update(range(j1, j2))
    return sorted(extras)


def _merge_rects(words: List[Dict]) -> List[Dict]:
    """Merge bounding boxes of adjacent words on the same line."""
    _require_pymupdf()
    if not words:
        return []
    rects: List[Dict] = []
    cur = None
    cur_line = None
    cur_page = -1
    for w in words:
        rect = list(w["rect"])
        line_key = (w["page"], w["block_no"], w["line_no"])
        if cur is None:
            cur = rect
            cur_line = line_key
            cur_page = w["page"]
            continue
        if line_key == cur_line and rect[0] - cur[2] <= 10:
            cur[2] = max(cur[2], rect[2])
            cur[1] = min(cur[1], rect[1])
            cur[3] = max(cur[3], rect[3])
        else:
            rects.append({"page": cur_page, "rect": tuple(cur)})
            cur = rect
            cur_line = line_key
            cur_page = w["page"]
    if cur is not None:
        rects.append({"page": cur_page, "rect": tuple(cur)})
    return rects


def highlight_extra_in_pdf(
    suspect_pdf: str,
    suspect_words: List[Dict],
    extra_indices: List[int],
    output_path: str,
) -> int:
    """Highlight extra words in yellow on the suspect PDF. Returns annotation count."""
    pymupdf = _require_pymupdf()
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    if not extra_indices:
        shutil.copy2(suspect_pdf, output_path)
        return 0

    extra_data = [suspect_words[i] for i in extra_indices if i < len(suspect_words)]
    regions = _merge_rects(extra_data)
    count = 0
    YELLOW = (1.0, 1.0, 0.0)

    with pymupdf.open(suspect_pdf) as doc:
        for region in regions:
            page = doc[region["page"]]
            annot = page.add_highlight_annot(pymupdf.Rect(region["rect"]))
            if annot:
                annot.set_colors(stroke=YELLOW)
                annot.update(opacity=0.5)
                count += 1
        doc.save(output_path, garbage=4, deflate=True)
    return count


def compute_comparison(
    source_pdf: str,
    suspect_pdf: str,
    output_pdf: str,
) -> Dict:
    """
    Compare two PDFs word-by-word.
    Highlights extra/added text in the suspect document with yellow.
    Returns result dict with similarity scores and highlight info.
    """
    source_text, source_pages = extract_pdf_text(source_pdf)
    suspect_text, suspect_pages = extract_pdf_text(suspect_pdf)
    suspect_words = extract_words_with_positions(suspect_pdf)

    source_norms = [_norm(w) for w in source_text.split() if _norm(w)]
    suspect_norms = [w["norm"] for w in suspect_words]

    extra_indices = find_extra_indices(source_norms, suspect_norms)

    extra_data = [suspect_words[i] for i in extra_indices if i < len(suspect_words)]
    merged = _merge_rects(extra_data)

    page_map: Dict[int, List] = {}
    for r in merged:
        pg = r["page"] + 1
        page_map.setdefault(pg, []).append(list(r["rect"]))
    frontend_highlights = [
        {"page_number": pg, "regions": rects}
        for pg, rects in sorted(page_map.items())
    ]

    highlight_count = highlight_extra_in_pdf(
        suspect_pdf, suspect_words, extra_indices, output_pdf
    )

    total = len(suspect_norms)
    extra_count = len(extra_indices)
    common = total - extra_count
    similarity = round(common / total * 100, 1) if total else 100.0
    extra_pct = round(extra_count / total * 100, 1) if total else 0.0

    snippets: List[str] = []
    current: List[str] = []
    last = -2
    for idx in extra_indices:
        if idx < len(suspect_words):
            if idx == last + 1:
                current.append(suspect_words[idx]["text"])
            else:
                if current:
                    snippets.append(" ".join(current))
                current = [suspect_words[idx]["text"]]
            last = idx
    if current:
        snippets.append(" ".join(current))

    return {
        "similarity_score": similarity,
        "extra_percentage": extra_pct,
        "total_words": total,
        "extra_word_count": extra_count,
        "common_word_count": common,
        "highlight_count": highlight_count,
        "source_pages": source_pages,
        "suspect_pages": suspect_pages,
        "source_text": source_text,
        "suspect_text": suspect_text,
        "extra_snippets": snippets[:100],
        "frontend_highlights": frontend_highlights,
    }
