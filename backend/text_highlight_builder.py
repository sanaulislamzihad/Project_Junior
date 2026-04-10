"""
Build character ranges in source_text for similarity highlights (non-PDF / text view).
Uses grouped matches' similar_sentences.query_sentence strings.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Tuple


def _find_spans(haystack: str, needle: str) -> List[Tuple[int, int]]:
    needle = (needle or "").strip()
    if len(needle) < 2:
        return []
    spans: List[Tuple[int, int]] = []
    pos = 0
    while True:
        i = haystack.find(needle, pos)
        if i < 0:
            break
        spans.append((i, i + len(needle)))
        pos = i + max(1, len(needle) // 2)
    if spans:
        return spans
    parts = [re.escape(p) for p in needle.split() if p]
    if not parts:
        return []
    try:
        pattern = re.compile(r"\s+".join(parts), re.IGNORECASE | re.DOTALL)
    except re.error:
        return []
    for m in pattern.finditer(haystack):
        spans.append((m.start(), m.end()))
    return spans


def build_text_highlights(source_text: str, matches: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Return [{start, end, match_index}, ...] for coloring spans like the PDF viewer."""
    if not source_text or not matches:
        return []
    out: List[Dict[str, Any]] = []
    for match_index, match in enumerate(matches):
        for sm in match.get("similar_sentences") or []:
            q = sm.get("query_sentence") or ""
            for start, end in _find_spans(source_text, q):
                out.append({"start": start, "end": end, "match_index": match_index})
    seen = set()
    deduped: List[Dict[str, Any]] = []
    for s in out:
        key = (s["start"], s["end"], s["match_index"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(s)
    deduped.sort(key=lambda x: (x["start"], x["end"]))
    return deduped
