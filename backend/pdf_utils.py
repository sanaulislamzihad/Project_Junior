from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT

def create_pdf_from_text(text: str, output_path: str, title: str = "Direct Text Submission"):
    """
    Generate a professional-looking PDF from raw text using reportlab.
    Preserves line breaks and uses standard margins.
    """
    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        rightMargin=72,
        leftMargin=72,
        topMargin=72,
        bottomMargin=72
    )
    
    styles = getSampleStyleSheet()
    
    # Custom style for the text to preserve layout and look academic
    text_style = ParagraphStyle(
        'DirectTextStyle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=11,
        leading=16,
        alignment=TA_LEFT,
        spaceAfter=12
    )
    
    title_style = styles['Heading1']
    title_style.alignment = TA_LEFT
    title_style.spaceAfter = 20

    content = []
    
    # Add title
    content.append(Paragraph(title, title_style))
    content.append(Spacer(1, 12))
    
    # Split text into paragraphs/lines
    # We replace \n with <br/> for ReportLab Paragraphs to preserve spacing
    formatted_text = text.replace('\n', '<br/>')
    
    # Add the text
    content.append(Paragraph(formatted_text, text_style))
    
    # Build the PDF
    doc.build(content)
    return output_path
