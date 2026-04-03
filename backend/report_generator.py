"""
Turnitin-style Similarity Report Generator
Generates a professional PDF report matching Turnitin's visual style.
"""
import io
import os
from datetime import datetime
from typing import Dict, List, Optional, Any

try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm, cm
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
        HRFlowable, KeepTogether, PageBreak
    )
    from reportlab.graphics.shapes import Drawing, Rect, String, Circle, Wedge, Line
    from reportlab.graphics.charts.piecharts import Pie
    from reportlab.graphics import renderPDF
    from reportlab.pdfgen import canvas
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False


# ─── Turnitin-inspired color palette ───────────────────────────────────────
RED_HIGH    = colors.HexColor("#e53e3e")
ORANGE_MED  = colors.HexColor("#dd6b20")
GREEN_LOW   = colors.HexColor("#38a169")
BLUE_ACCENT = colors.HexColor("#2b6cb0")
TURNITIN_RED= colors.HexColor("#c0392b")
HEADER_BG   = colors.HexColor("#1a202c")
CARD_BG     = colors.HexColor("#f7fafc")
BORDER_CLR  = colors.HexColor("#e2e8f0")
TEXT_DARK   = colors.HexColor("#2d3748")
TEXT_MID    = colors.HexColor("#718096")
TEXT_LIGHT  = colors.HexColor("#a0aec0")
MATCH_COLORS = [
    colors.HexColor("#e53e3e"),
    colors.HexColor("#3182ce"),
    colors.HexColor("#805ad5"),
    colors.HexColor("#38a169"),
    colors.HexColor("#d69e2e"),
    colors.HexColor("#e53e8a"),
    colors.HexColor("#4c51bf"),
    colors.HexColor("#2c7a7b"),
]


def _score_color(pct: float):
    if pct >= 60:
        return RED_HIGH
    if pct >= 30:
        return ORANGE_MED
    return GREEN_LOW


def _score_label(pct: float) -> str:
    if pct >= 60:
        return "HIGH SIMILARITY"
    if pct >= 30:
        return "MODERATE SIMILARITY"
    return "LOW SIMILARITY"


def _make_ring_gauge(value: float, size: float = 90) -> Drawing:
    """Draw a circular gauge like Turnitin's score ring."""
    d = Drawing(size, size)
    cx, cy = size / 2, size / 2
    r = size / 2 - 8
    stroke_w = 9

    # Background ring
    from reportlab.graphics.shapes import Circle
    bg = Circle(cx, cy, r)
    bg.strokeColor = BORDER_CLR
    bg.strokeWidth = stroke_w
    bg.fillColor = colors.white
    d.add(bg)

    # Foreground arc (simulate with Wedge segments)
    arc_color = _score_color(value)
    degrees = (value / 100) * 360
    if degrees > 0:
        wedge = Wedge(cx, cy, r, 90, 90 - degrees,
                      strokeColor=arc_color,
                      strokeWidth=stroke_w,
                      fillColor=colors.white)
        d.add(wedge)

    # Center text
    pct_str = f"{int(value)}%"
    t = String(cx, cy - 4, pct_str,
               fontName="Helvetica-Bold",
               fontSize=18 if len(pct_str) <= 3 else 14,
               fillColor=arc_color,
               textAnchor="middle")
    d.add(t)
    return d


def _mini_bar_table(label: str, value: float, bar_color) -> Table:
    """Single metric bar row."""
    bar_width = 120
    filled = max(2, int(bar_width * value / 100))
    bar_drawing = Drawing(bar_width, 8)
    bar_drawing.add(Rect(0, 0, bar_width, 8, fillColor=BORDER_CLR, strokeColor=None, rx=4, ry=4))
    bar_drawing.add(Rect(0, 0, filled, 8, fillColor=bar_color, strokeColor=None, rx=4, ry=4))

    data = [[
        Paragraph(f'<font size="8" color="#718096">{label}</font>', ParagraphStyle('x')),
        bar_drawing,
        Paragraph(f'<font size="8"><b>{int(value)}%</b></font>',
                  ParagraphStyle('x', textColor=bar_color)),
    ]]
    t = Table(data, colWidths=[80, bar_width + 4, 30])
    t.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))
    return t


class _NumberedCanvas(canvas.Canvas):
    """Canvas that adds page numbers in Turnitin footer style."""
    def __init__(self, *args, **kwargs):
        canvas.Canvas.__init__(self, *args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self._draw_page_footer(num_pages)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)

    def _draw_page_footer(self, page_count):
        self.saveState()
        page_num = self._pageNumber
        w, h = A4
        # Footer bar
        self.setFillColor(HEADER_BG)
        self.rect(0, 0, w, 22 * mm, fill=1, stroke=0)
        # Left: branding
        self.setFillColor(colors.white)
        self.setFont("Helvetica-Bold", 8)
        self.drawString(15 * mm, 8 * mm, "NSU PlagiChecker")
        self.setFont("Helvetica", 7)
        self.setFillColor(TEXT_LIGHT)
        self.drawString(15 * mm, 4 * mm, "Powered by AI Similarity Detection")
        # Right: page number
        self.setFillColor(colors.white)
        self.setFont("Helvetica", 8)
        page_text = f"Page {page_num} of {page_count}"
        self.drawRightString(w - 15 * mm, 6 * mm, page_text)
        self.restoreState()


def _generate_full_analysis_report(
    data: Dict[str, Any],
    output_path: str,
) -> str:
    """
    Fallback: full analysis report with score overview, source table, and match details.
    Used when no highlighted PDF is available.
    """
    if not REPORTLAB_AVAILABLE:
        raise ImportError("reportlab is required. pip install reportlab")

    os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else ".", exist_ok=True)

    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=15 * mm,
        bottomMargin=28 * mm,
        title="Similarity Report",
        author="NSU PlagiChecker",
    )

    W = A4[0] - 36 * mm  # usable width
    story = []

    # ── Styles ──────────────────────────────────────────────────────────────
    base = getSampleStyleSheet()

    def S(name, **kw):
        return ParagraphStyle(name, **kw)

    h1 = S("h1", fontSize=22, fontName="Helvetica-Bold", textColor=colors.white,
            spaceAfter=2, leading=26)
    h2 = S("h2", fontSize=13, fontName="Helvetica-Bold", textColor=TEXT_DARK,
            spaceBefore=10, spaceAfter=4, leading=16)
    h3 = S("h3", fontSize=10, fontName="Helvetica-Bold", textColor=TEXT_DARK,
            spaceBefore=6, spaceAfter=2, leading=13)
    body = S("body", fontSize=9, fontName="Helvetica", textColor=TEXT_DARK,
             leading=14, spaceAfter=3)
    small = S("small", fontSize=8, fontName="Helvetica", textColor=TEXT_MID, leading=11)
    caption = S("caption", fontSize=7, fontName="Helvetica", textColor=TEXT_LIGHT,
                alignment=TA_CENTER, leading=10)
    mono = S("mono", fontSize=8, fontName="Courier", textColor=TEXT_MID, leading=11)

    # ── Computed values ──────────────────────────────────────────────────────
    overall_pct   = min(100, max(0, round(float(data.get("overall_similarity", 0)))))
    semantic_pct  = min(100, max(0, round(float(data.get("semantic_similarity", 0)))))
    lexical_pct   = min(100, max(0, round(float(data.get("lexical_similarity", 0)))))
    fp_pct        = min(100, max(0, round(float(data.get("fingerprint_similarity", 0)))))
    matches       = data.get("matches") or []
    metadata      = data.get("metadata") or {}
    filename      = data.get("filename") or metadata.get("file_name") or "Unknown Document"
    generated_at  = datetime.now().strftime("%d %B %Y, %H:%M")
    score_color   = _score_color(overall_pct)
    score_label   = _score_label(overall_pct)

    # ════════════════════════════════════════════════════════════════════════
    # SECTION 1 — HEADER BANNER
    # ════════════════════════════════════════════════════════════════════════
    header_table_data = [[
        Paragraph('<font color="white" size="20"><b>Similarity Report</b></font>', base["Normal"]),
        Paragraph(f'<font color="#a0aec0" size="8">Generated: {generated_at}</font>', base["Normal"]),
    ]]
    header_table = Table(header_table_data, colWidths=[W * 0.65, W * 0.35])
    header_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), HEADER_BG),
        ('ALIGN', (0, 0), (0, 0), 'LEFT'),
        ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 14),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 14),
        ('LEFTPADDING', (0, 0), (0, 0), 14),
        ('RIGHTPADDING', (1, 0), (1, 0), 14),
        ('ROUNDEDCORNERS', [6, 6, 6, 6]),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 8))

    # Document name row
    doc_row = Table([[
        Paragraph(f'<font size="9" color="#718096">Document: </font>'
                  f'<font size="9" color="#2d3748"><b>{filename}</b></font>', base["Normal"]),
        Paragraph(f'<font size="8" color="#718096">{score_label}</font>', base["Normal"]),
    ]], colWidths=[W * 0.65, W * 0.35])
    doc_row.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), CARD_BG),
        ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (0, 0), 12),
        ('RIGHTPADDING', (1, 0), (1, 0), 12),
        ('BOX', (0, 0), (-1, -1), 0.5, BORDER_CLR),
        ('ROUNDEDCORNERS', [4, 4, 4, 4]),
        ('TEXTCOLOR', (1, 0), (1, 0), score_color),
    ]))
    story.append(doc_row)
    story.append(Spacer(1, 14))

    # ════════════════════════════════════════════════════════════════════════
    # SECTION 2 — SCORE OVERVIEW  (gauge + metric bars, side by side)
    # ════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("Similarity Score Overview", h2))
    story.append(HRFlowable(width=W, thickness=0.5, color=BORDER_CLR, spaceAfter=8))

    gauge = _make_ring_gauge(overall_pct, size=90)

    bars_content = [
        _mini_bar_table("Overall Similarity",     overall_pct,  score_color),
        Spacer(1, 4),
        _mini_bar_table("Semantic (AI) Similarity", semantic_pct, BLUE_ACCENT),
        Spacer(1, 4),
        _mini_bar_table("Lexical (Exact) Match",   lexical_pct,  colors.HexColor("#319795")),
        Spacer(1, 4),
        _mini_bar_table("Fingerprint Match",        fp_pct,       colors.HexColor("#805ad5")),
    ]

    from reportlab.platypus import ListFlowable
    gauge_cell = Table([[gauge]], colWidths=[100])
    gauge_cell.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BACKGROUND', (0, 0), (-1, -1), colors.white),
        ('BOX', (0, 0), (-1, -1), 0.5, BORDER_CLR),
        ('ROUNDEDCORNERS', [6, 6, 6, 6]),
        ('TOPPADDING', (0, 0), (-1, -1), 12),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
    ]))

    # Bars column
    bars_table = Table(
        [[item] for item in bars_content],
        colWidths=[W - 120]
    )
    bars_table.setStyle(TableStyle([
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))

    overview_table = Table(
        [[gauge_cell, bars_table]],
        colWidths=[110, W - 110]
    )
    overview_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (0, 0), 0),
        ('RIGHTPADDING', (0, 0), (0, 0), 10),
        ('LEFTPADDING', (1, 0), (1, 0), 10),
        ('BACKGROUND', (1, 0), (1, 0), CARD_BG),
        ('BOX', (1, 0), (1, 0), 0.5, BORDER_CLR),
        ('ROUNDEDCORNERS', [0, 6, 6, 0]),
        ('TOPPADDING', (1, 0), (1, 0), 12),
        ('BOTTOMPADDING', (1, 0), (1, 0), 12),
        ('RIGHTPADDING', (1, 0), (1, 0), 14),
    ]))
    story.append(overview_table)
    story.append(Spacer(1, 16))

    # ════════════════════════════════════════════════════════════════════════
    # SECTION 3 — DOCUMENT METADATA
    # ════════════════════════════════════════════════════════════════════════
    if metadata:
        story.append(Paragraph("Document Information", h2))
        story.append(HRFlowable(width=W, thickness=0.5, color=BORDER_CLR, spaceAfter=8))

        meta_rows = []
        if metadata.get("file_name"):
            meta_rows.append(["File Name", metadata["file_name"]])
        if metadata.get("document_id"):
            meta_rows.append(["Document ID", metadata["document_id"]])
        if metadata.get("file_type"):
            meta_rows.append(["File Type", metadata["file_type"].upper()])
        if metadata.get("num_pages_or_slides") is not None:
            meta_rows.append(["Pages / Slides", str(metadata["num_pages_or_slides"])])
        if metadata.get("num_chunks") is not None:
            meta_rows.append(["Text Chunks Analyzed", str(metadata["num_chunks"])])
        if metadata.get("raw_text_length") is not None:
            meta_rows.append(["Characters Extracted", f"{metadata['raw_text_length']:,}"])
        if metadata.get("indexing_time") is not None:
            meta_rows.append(["Processing Time", f"{metadata['indexing_time']}s"])
        meta_rows.append(["Report Generated", generated_at])

        def meta_cell(txt, bold=False):
            style = ParagraphStyle('mc', fontSize=8, fontName="Helvetica-Bold" if bold else "Helvetica",
                                   textColor=TEXT_DARK if bold else TEXT_MID, leading=11)
            return Paragraph(txt, style)

        table_data = [[meta_cell(k, bold=True), meta_cell(v)] for k, v in meta_rows]
        meta_table = Table(table_data, colWidths=[W * 0.38, W * 0.62])
        meta_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.white),
            ('BACKGROUND', (0, 0), (0, -1), CARD_BG),
            ('BOX', (0, 0), (-1, -1), 0.5, BORDER_CLR),
            ('INNERGRID', (0, 0), (-1, -1), 0.3, BORDER_CLR),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('LEFTPADDING', (0, 0), (-1, -1), 10),
            ('RIGHTPADDING', (0, 0), (-1, -1), 10),
            ('ROUNDEDCORNERS', [4, 4, 4, 4]),
        ]))
        story.append(meta_table)
        story.append(Spacer(1, 16))

    # ════════════════════════════════════════════════════════════════════════
    # SECTION 4 — MATCHED SOURCES
    # ════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("Matched Sources", h2))
    story.append(HRFlowable(width=W, thickness=0.5, color=BORDER_CLR, spaceAfter=8))

    if not matches:
        story.append(Paragraph(
            '<font color="#38a169">✓ No matching sources found. This document appears to be original.</font>',
            S("ok", fontSize=10, fontName="Helvetica", leading=14, textColor=GREEN_LOW,
              borderPadding=10, backColor=colors.HexColor("#f0fff4"),
              borderColor=GREEN_LOW, borderWidth=1)
        ))
    else:
        # Summary table header
        hdr_data = [["#", "Source Document", "Overall", "Semantic", "Lexical", "Sentences"]]
        hdr_style = ParagraphStyle('th', fontSize=8, fontName="Helvetica-Bold",
                                   textColor=colors.white, leading=10)
        hdr_row = [[
            Paragraph(c, hdr_style) for c in hdr_data[0]
        ]]
        rows_data = [hdr_row[0]]
        for i, m in enumerate(matches):
            col = MATCH_COLORS[i % len(MATCH_COLORS)]
            sem = min(100, round(float(m.get("semantic_similarity", 0)) * 100))
            lex = min(100, round(float(m.get("lexical_similarity", 0)) * 100))
            combined = min(100, round(float(m.get("combined_similarity", m.get("semantic_similarity", 0))) * 100))
            n_sents = len(m.get("similar_sentences") or [])
            fname = m.get("file_name") or m.get("filename") or "Unknown"
            if len(fname) > 40:
                fname = fname[:37] + "..."

            def rc(txt, color=TEXT_DARK, bold=False):
                st = ParagraphStyle('rc', fontSize=8,
                                    fontName="Helvetica-Bold" if bold else "Helvetica",
                                    textColor=color, leading=10)
                return Paragraph(str(txt), st)

            # Color dot + number
            num_cell = Paragraph(
                f'<font color="{col.hexval()}" size="9"><b>{i+1}</b></font>',
                ParagraphStyle('dot', fontSize=9, fontName="Helvetica-Bold",
                               textColor=col, alignment=TA_CENTER, leading=12)
            )
            rows_data.append([
                num_cell,
                rc(fname),
                rc(f"{combined}%", color=_score_color(combined), bold=True),
                rc(f"{sem}%", color=BLUE_ACCENT),
                rc(f"{lex}%", color=colors.HexColor("#319795")),
                rc(str(n_sents)),
            ])

        summary_table = Table(
            rows_data,
            colWidths=[18, W - 18 - 45 - 45 - 45 - 35, 45, 45, 45, 35]
        )
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), HEADER_BG),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (2, 0), (-1, -1), 'CENTER'),
            ('ALIGN', (0, 0), (0, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, CARD_BG]),
            ('BOX', (0, 0), (-1, -1), 0.5, BORDER_CLR),
            ('INNERGRID', (0, 0), (-1, -1), 0.3, BORDER_CLR),
            ('ROUNDEDCORNERS', [4, 4, 4, 4]),
        ]))
        story.append(summary_table)
        story.append(Spacer(1, 16))

        # ── Per-match detail cards ──────────────────────────────────────────
        story.append(Paragraph("Match Details", h2))
        story.append(HRFlowable(width=W, thickness=0.5, color=BORDER_CLR, spaceAfter=10))

        for i, m in enumerate(matches):
            col = MATCH_COLORS[i % len(MATCH_COLORS)]
            sem = min(100, round(float(m.get("semantic_similarity", 0)) * 100))
            lex = min(100, round(float(m.get("lexical_similarity", 0)) * 100))
            combined = min(100, round(float(m.get("combined_similarity", m.get("semantic_similarity", 0))) * 100))
            fname = m.get("file_name") or m.get("filename") or "Unknown"
            similar_sentences = m.get("similar_sentences") or []

            # Card title bar
            title_data = [[
                Paragraph(
                    f'<font color="white" size="9"><b>Match {i+1}</b></font>',
                    base["Normal"]
                ),
                Paragraph(
                    f'<font color="white" size="9">{fname}</font>',
                    ParagraphStyle('fn', fontSize=9, fontName="Helvetica",
                                   textColor=colors.white, leading=11, alignment=TA_LEFT)
                ),
                Paragraph(
                    f'<font color="white" size="10"><b>{combined}%</b></font>',
                    ParagraphStyle('sc', fontSize=10, fontName="Helvetica-Bold",
                                   textColor=colors.white, alignment=TA_RIGHT, leading=12)
                ),
            ]]
            title_table = Table(title_data, colWidths=[55, W - 55 - 50, 50])
            title_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), col),
                ('ALIGN', (2, 0), (2, 0), 'RIGHT'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('TOPPADDING', (0, 0), (-1, -1), 7),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
                ('LEFTPADDING', (0, 0), (0, 0), 10),
                ('LEFTPADDING', (1, 0), (1, 0), 6),
                ('RIGHTPADDING', (2, 0), (2, 0), 10),
                ('ROUNDEDCORNERS', [4, 4, 0, 0]),
            ]))

            # Metric sub-row
            metric_data = [[
                Paragraph(f'<font size="8" color="#718096">Semantic: </font>'
                          f'<font size="8"><b>{sem}%</b></font>', base["Normal"]),
                Paragraph(f'<font size="8" color="#718096">Lexical: </font>'
                          f'<font size="8"><b>{lex}%</b></font>', base["Normal"]),
                Paragraph(f'<font size="8" color="#718096">Matched sentences: </font>'
                          f'<font size="8"><b>{len(similar_sentences)}</b></font>', base["Normal"]),
            ]]
            metric_table = Table(metric_data, colWidths=[W // 3, W // 3, W // 3])
            metric_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), CARD_BG),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('LEFTPADDING', (0, 0), (-1, -1), 10),
                ('INNERGRID', (0, 0), (-1, -1), 0.3, BORDER_CLR),
                ('BOX', (0, 0), (-1, -1), 0.5, BORDER_CLR),
                ('ROUNDEDCORNERS', [0, 0, 4, 4]),
            ]))

            card_content = [title_table, metric_table]

            # Sentence matches
            if similar_sentences:
                card_content.append(Spacer(1, 5))
                card_content.append(
                    Paragraph("Similar Sentences Detected:", h3)
                )
                for j, sm in enumerate(similar_sentences[:8]):  # cap at 8 per match
                    q = (sm.get("query_sentence") or "").strip()
                    r = (sm.get("matched_sentence") or "").strip()
                    s_sem = min(100, round(float(sm.get("semantic_similarity", 0)) * 100))
                    s_lex = min(100, round(float(sm.get("lexical_similarity", 0)) * 100))

                    sentence_data = [
                        [
                            Paragraph(
                                f'<font size="8" color="{col.hexval()}"><b>Your text:</b></font> '
                                f'<font size="8" color="#2d3748">{q}</font>',
                                ParagraphStyle('qs', fontSize=8, fontName="Helvetica",
                                               textColor=TEXT_DARK, leading=12)
                            )
                        ],
                        [
                            Paragraph(
                                f'<font size="8" color="#718096"><b>Matched:</b></font> '
                                f'<font size="8" color="#4a5568">{r}</font>',
                                ParagraphStyle('rs', fontSize=8, fontName="Helvetica",
                                               textColor=TEXT_MID, leading=12)
                            )
                        ],
                        [
                            Paragraph(
                                f'<font size="7" color="#a0aec0">Semantic: {s_sem}%  •  '
                                f'Lexical: {s_lex}%</font>',
                                ParagraphStyle('ss', fontSize=7, fontName="Helvetica",
                                               textColor=TEXT_LIGHT, leading=10)
                            )
                        ],
                    ]
                    sent_table = Table(sentence_data, colWidths=[W])
                    sent_table.setStyle(TableStyle([
                        ('BACKGROUND', (0, 0), (-1, -1), colors.white),
                        ('BACKGROUND', (0, 0), (0, 0), colors.HexColor("#fff5f5") if col == RED_HIGH
                         else colors.HexColor("#ebf8ff")),
                        ('BOX', (0, 0), (-1, -1), 0.5, BORDER_CLR),
                        ('LEFTBORDER', (0, 0), (0, 0), 3, col),
                        ('LINEAFTER', (0, 0), (0, 2), 0, colors.white),
                        ('LINEBEFORE', (0, 0), (0, 2), 3, col),
                        ('TOPPADDING', (0, 0), (-1, -1), 5),
                        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                        ('LEFTPADDING', (0, 0), (-1, -1), 9),
                        ('INNERGRID', (0, 0), (-1, -1), 0.3, BORDER_CLR),
                        ('ROUNDEDCORNERS', [2, 2, 2, 2]),
                    ]))
                    card_content.append(sent_table)
                    card_content.append(Spacer(1, 3))

                if len(similar_sentences) > 8:
                    card_content.append(Paragraph(
                        f'<font size="8" color="#a0aec0">... and {len(similar_sentences) - 8} more matched sentences.</font>',
                        small
                    ))

            story.append(KeepTogether(card_content[:3]))  # keep title+metrics together
            for part in card_content[3:]:
                story.append(part)
            story.append(Spacer(1, 14))

    # ════════════════════════════════════════════════════════════════════════
    # SECTION 5 — DISCLAIMER
    # ════════════════════════════════════════════════════════════════════════
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width=W, thickness=0.5, color=BORDER_CLR, spaceBefore=4, spaceAfter=8))
    disclaimer = (
        "This report was generated by NSU PlagiChecker using AI-powered semantic similarity analysis. "
        "Results are based on the documents currently in the repository and should be reviewed by an "
        "instructor before any academic action is taken. A high similarity score does not automatically "
        "indicate plagiarism."
    )
    story.append(Paragraph(disclaimer,
                            ParagraphStyle("disc", fontSize=7.5, fontName="Helvetica",
                                           textColor=TEXT_LIGHT, leading=11, alignment=TA_JUSTIFY)))

    # ── Build PDF ────────────────────────────────────────────────────────────
    doc.build(story, canvasmaker=_NumberedCanvas)
    return output_path


# ════════════════════════════════════════════════════════════════════════════
# Turnitin-style combined report: highlighted PDF pages + source list
# ════════════════════════════════════════════════════════════════════════════

def _get_highlighted_pdf_path(data: Dict[str, Any]) -> Optional[str]:
    """Extract the highlighted PDF file path from the analysis data."""
    url = data.get("highlighted_pdf_url")
    if not url:
        return None
    try:
        artifact_name = url.rsplit("/artifacts/", 1)[-1]
    except (IndexError, ValueError):
        return None
    if not artifact_name:
        return None
    artifacts_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "artifacts")
    path = os.path.join(artifacts_dir, os.path.basename(artifact_name))
    return path if os.path.isfile(path) else None


def _make_source_badge(number: int, badge_color) -> Drawing:
    """Colored rounded badge with white number — matches Turnitin source list style."""
    w, h = 20, 17
    d = Drawing(w, h)
    d.add(Rect(0, 0, w, h, fillColor=badge_color, strokeColor=None, rx=3, ry=3))
    d.add(String(w / 2, 4.5, str(number),
                 fontName="Helvetica-Bold", fontSize=9,
                 fillColor=colors.white, textAnchor="middle"))
    return d


def _generate_source_list_pdf(data: Dict[str, Any], output_path: str) -> str:
    """Generate Turnitin-style originality report / source list pages."""
    if not REPORTLAB_AVAILABLE:
        raise ImportError("reportlab is required. pip install reportlab")

    os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else ".", exist_ok=True)

    doc_builder = SimpleDocTemplate(
        output_path, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=15 * mm, bottomMargin=28 * mm,
        title="Originality Report", author="NSU PlagiChecker",
    )
    W = A4[0] - 36 * mm
    story = []
    base = getSampleStyleSheet()

    overall_pct = min(100, max(0, round(float(data.get("overall_similarity", 0)))))
    matches = data.get("matches") or []
    metadata = data.get("metadata") or {}
    filename = data.get("filename") or metadata.get("file_name") or "Unknown Document"
    if len(filename) > 60:
        filename = filename[:57] + "..."
    score_clr = _score_color(overall_pct)

    # ── Header: Document name + ORIGINALITY REPORT ──
    story.append(Paragraph(
        f"<b>{filename}</b>",
        ParagraphStyle("fn", fontSize=15, leading=20, textColor=TEXT_DARK,
                       fontName="Helvetica-Bold"),
    ))
    story.append(Paragraph(
        "<b>ORIGINALITY REPORT</b>",
        ParagraphStyle("or", fontSize=9, leading=12, textColor=TEXT_MID,
                       fontName="Helvetica-Bold", spaceAfter=14),
    ))

    # ── Big similarity percentage ──
    story.append(Paragraph(
        f'<font size="42"><b>{overall_pct}%</b></font>',
        ParagraphStyle("pct", fontSize=42, leading=48, textColor=score_clr,
                       fontName="Helvetica-Bold"),
    ))
    story.append(Paragraph(
        "<b>SIMILARITY INDEX</b>",
        ParagraphStyle("si", fontSize=9, leading=12, textColor=TEXT_MID,
                       fontName="Helvetica-Bold", spaceAfter=18),
    ))

    # ── MATCHED SOURCES heading ──
    story.append(Paragraph(
        "<b>MATCHED SOURCES</b>",
        ParagraphStyle("ms", fontSize=10, leading=13, textColor=TEXT_DARK,
                       fontName="Helvetica-Bold", spaceAfter=8),
    ))
    story.append(HRFlowable(width=W, thickness=0.8, color=BORDER_CLR, spaceAfter=6))

    if not matches:
        story.append(Spacer(1, 10))
        story.append(Paragraph(
            '<font color="#38a169">\u2713 No matching sources found. Document appears original.</font>',
            ParagraphStyle("ok", fontSize=10, textColor=GREEN_LOW, leading=14),
        ))
    else:
        sentence_style_q = ParagraphStyle(
            "sq", fontSize=7.5, fontName="Helvetica", textColor=TEXT_DARK,
            leading=10, leftIndent=6,
        )
        sentence_style_m = ParagraphStyle(
            "sm", fontSize=7.5, fontName="Helvetica", textColor=TEXT_MID,
            leading=10, leftIndent=6,
        )
        sentence_style_s = ParagraphStyle(
            "ss_score", fontSize=7, fontName="Helvetica", textColor=TEXT_LIGHT,
            leading=9, leftIndent=6,
        )

        for i, m in enumerate(matches):
            col = MATCH_COLORS[i % len(MATCH_COLORS)]
            col_light = colors.Color(
                min(1, col.red * 0.15 + 0.85),
                min(1, col.green * 0.15 + 0.85),
                min(1, col.blue * 0.15 + 0.85),
            )
            fname = m.get("file_name") or m.get("filename") or "Unknown"
            combined = min(100, round(
                float(m.get("combined_similarity", m.get("semantic_similarity", 0))) * 100
            ))
            n_sents = len(m.get("similar_sentences") or [])
            badge = _make_source_badge(i + 1, col)

            # ── Source header row: badge | name | stats ──
            name_para = Paragraph(
                f'<font size="9"><b>{fname}</b></font><br/>'
                f'<font size="7.5" color="#a0aec0">Repository Document</font>',
                ParagraphStyle("sn", fontSize=9, leading=12, textColor=TEXT_DARK,
                               fontName="Helvetica-Bold"),
            )
            stats_para = Paragraph(
                f'<font size="9"><b>{combined}%</b></font> '
                f'<font size="8" color="#a0aec0">\u2014 {n_sents} sentence{"s" if n_sents != 1 else ""}</font>',
                ParagraphStyle("st", fontSize=9, alignment=TA_RIGHT, leading=12,
                               fontName="Helvetica-Bold", textColor=col),
            )
            header_row = Table(
                [[badge, name_para, stats_para]],
                colWidths=[28, W - 28 - 120, 120],
            )
            header_row.setStyle(TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("BACKGROUND", (0, 0), (-1, -1), colors.white),
            ]))

            card_items = [header_row]

            # ── Matched sentences under this source ──
            similar_sentences = m.get("similar_sentences") or []
            shown = similar_sentences[:5]
            if shown:
                for j, sm in enumerate(shown):
                    q = (sm.get("query_sentence") or "").strip()
                    r = (sm.get("matched_sentence") or "").strip()
                    s_sem = min(100, round(float(sm.get("semantic_similarity", 0)) * 100))
                    s_lex = min(100, round(float(sm.get("lexical_similarity", 0)) * 100))
                    if not q:
                        continue

                    sent_rows = [
                        [Paragraph(
                            f'<font color="{col.hexval()}"><b>Your text:</b></font> '
                            f'<font color="#2d3748">{q[:200]}</font>',
                            sentence_style_q,
                        )],
                    ]
                    if r:
                        sent_rows.append([Paragraph(
                            f'<font color="#718096"><b>Matched:</b></font> '
                            f'<font color="#4a5568">{r[:200]}</font>',
                            sentence_style_m,
                        )])
                    sent_rows.append([Paragraph(
                        f'Semantic: {s_sem}%  \u2022  Lexical: {s_lex}%',
                        sentence_style_s,
                    )])

                    sent_table = Table(sent_rows, colWidths=[W - 36])
                    sent_table.setStyle(TableStyle([
                        ("BACKGROUND", (0, 0), (-1, -1), col_light),
                        ("TOPPADDING", (0, 0), (-1, -1), 3),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                        ("LEFTPADDING", (0, 0), (-1, -1), 8),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                        ("LINEBEFORE", (0, 0), (0, -1), 2.5, col),
                    ]))

                    indent_table = Table(
                        [[Paragraph("", base["Normal"]), sent_table]],
                        colWidths=[32, W - 32],
                    )
                    indent_table.setStyle(TableStyle([
                        ("TOPPADDING", (0, 0), (-1, -1), 1),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
                        ("LEFTPADDING", (0, 0), (-1, -1), 0),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                    ]))
                    card_items.append(indent_table)

                remaining = len(similar_sentences) - 5
                if remaining > 0:
                    card_items.append(Table(
                        [[Paragraph("", base["Normal"]), Paragraph(
                            f'<font size="7" color="#a0aec0">... and {remaining} more matched sentences</font>',
                            base["Normal"],
                        )]],
                        colWidths=[32, W - 32],
                    ))

            card_items.append(
                HRFlowable(width=W, thickness=0.3, color=BORDER_CLR, spaceBefore=4, spaceAfter=4)
            )

            story.append(KeepTogether(card_items[:2]))
            for part in card_items[2:]:
                story.append(part)

    # ── Disclaimer ──
    story.append(Spacer(1, 18))
    story.append(HRFlowable(width=W, thickness=0.5, color=BORDER_CLR, spaceAfter=8))
    story.append(Paragraph(
        "This report was generated by NSU PlagiChecker using AI-powered similarity analysis. "
        "Results are based on documents in the repository. A high similarity score does not "
        "automatically indicate plagiarism.",
        ParagraphStyle("disc", fontSize=7.5, fontName="Helvetica",
                       textColor=TEXT_LIGHT, leading=11, alignment=TA_JUSTIFY),
    ))

    doc_builder.build(story, canvasmaker=_NumberedCanvas)
    return output_path


def generate_turnitin_report(data: Dict[str, Any], output_path: str) -> str:
    """
    Public API: Generate the downloadable similarity report.
    If a highlighted PDF exists: combines highlighted document + source list (Turnitin style).
    Otherwise: falls back to the full analysis report.
    """
    highlighted_path = _get_highlighted_pdf_path(data)

    if highlighted_path:
        try:
            import fitz as pymupdf
        except ImportError:
            return _generate_full_analysis_report(data, output_path)

        source_list_tmp = output_path + ".srclist.tmp.pdf"
        try:
            _generate_source_list_pdf(data, source_list_tmp)
            result_doc = pymupdf.open(highlighted_path)
            source_doc = pymupdf.open(source_list_tmp)
            result_doc.insert_pdf(source_doc)
            result_doc.save(output_path, garbage=4, deflate=True)
            result_doc.close()
            source_doc.close()
        finally:
            try:
                os.unlink(source_list_tmp)
            except OSError:
                pass
        return output_path

    return _generate_full_analysis_report(data, output_path)
