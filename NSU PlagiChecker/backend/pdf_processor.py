import pdfplumber
import os

def extract_text_from_pdf(file_path: str) -> str:
    """
    Extracts all text from a PDF file.
    
    Args:
        file_path (str): The absolute path to the PDF file.
        
    Returns:
        str: The extracted text content.
    """
    full_text = []
    try:
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    full_text.append(text)
        
        combined_text = "\n\n".join(full_text)
        
        # Clean up common PDF artifacts and ligatures
        replacements = {
            # Ligatures
            "ﬁ": "fi", "ﬂ": "fl", "ﬀ": "ff", "ﬃ": "ffi", "ﬄ": "ffl",
            # Smart quotes and dashes
            "“": '"', "”": '"', "‘": "'", "’": "'",
            "–": "-", "—": "-",
            # Zero width space
            "\u200b": ""
        }
        for old, new in replacements.items():
            combined_text = combined_text.replace(old, new)

        # Return text with original layout (newlines preserved)
        # We process this normalization later in main.py for matching
        return combined_text
    except Exception as e:
        print(f"Error extracting text from {file_path}: {e}")
        return ""

def validate_pdf(file_obj) -> bool:
    """
    Simple validation to check if the file seems to be a PDF.
    """
    if file_obj.content_type != "application/pdf":
        return False
    return True
