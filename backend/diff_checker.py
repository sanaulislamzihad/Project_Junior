import difflib
from typing import Dict, List


def _split_lines(text: str) -> List[str]:
    if not text:
        return []
    return text.splitlines()


def _line_diff_chunks(text_a: str, text_b: str) -> List[Dict]:
    a_lines = _split_lines(text_a)
    b_lines = _split_lines(text_b)
    sm = difflib.SequenceMatcher(a=a_lines, b=b_lines)
    chunks = []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        chunks.append(
            {
                "op": tag,  # equal | replace | delete | insert
                "a_start": i1,
                "a_end": i2,
                "b_start": j1,
                "b_end": j2,
                "a_lines": a_lines[i1:i2],
                "b_lines": b_lines[j1:j2],
            }
        )
    return chunks


def compute_diff(text_a: str, text_b: str, context_lines: int = 2) -> Dict:
    # Conventional line-level + character-level diff baseline.
    a_lines = _split_lines(text_a)
    b_lines = _split_lines(text_b)
    line_matcher = difflib.SequenceMatcher(a=a_lines, b=b_lines)
    char_matcher = difflib.SequenceMatcher(a=text_a or "", b=text_b or "")

    unified = list(
        difflib.unified_diff(
            a_lines,
            b_lines,
            fromfile="doc_a",
            tofile="doc_b",
            n=max(0, int(context_lines)),
            lineterm="",
        )
    )

    return {
        "line_similarity": round(float(line_matcher.ratio()), 4),
        "char_similarity": round(float(char_matcher.ratio()), 4),
        "line_chunks": _line_diff_chunks(text_a, text_b),
        "unified_diff": unified,
    }
