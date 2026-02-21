/**
 * Next week plan: Text Processing Pipeline
 * Shown in browser console on app load.
 */
export const TEXT_PROCESSING_PLAN = `
═══════════════════════════════════════════════════════════════
  TEXT PROCESSING PIPELINE — Next Week Plan
═══════════════════════════════════════════════════════════════

In the next week, we plan to start implementing the text processing
pipeline of our system. Our main goal will be to extract text from
uploaded PDF and PPTX files and prepare the text for similarity checking.

───────────────────────────────────────────────────────────────
1. PDF Text Extraction
───────────────────────────────────────────────────────────────
• We will research and finalize a method for PDF text extraction
  using libraries like PyPDF2 or pdfplumber.
• We plan to select one stable method and create a helper function
  that can extract text page by page.

───────────────────────────────────────────────────────────────
2. PPTX Text Extraction
───────────────────────────────────────────────────────────────
• We will implement PPTX text extraction using the python-pptx library
  so that slide contents can be collected and processed properly.

───────────────────────────────────────────────────────────────
3. Text Cleaning
───────────────────────────────────────────────────────────────
• After extracting the text, we will work on text cleaning techniques:
  - Removing extra spaces
  - Removing unwanted newline characters
  - Removing unnecessary special characters
  to make the text suitable for processing.

───────────────────────────────────────────────────────────────
4. Chunking Strategy
───────────────────────────────────────────────────────────────
• We will design and implement a chunking strategy where large
  documents will be divided into smaller segments based on token
  or word limits.
• We may also experiment with overlapping chunks to improve
  similarity detection accuracy.

───────────────────────────────────────────────────────────────
5. Metadata Structure
───────────────────────────────────────────────────────────────
• We plan to design a metadata structure to store document info:
  - Document ID
  - File name
  - File path
  - Number of chunks
  - Indexing time
  This will help us organize and manage repository documents efficiently.

═══════════════════════════════════════════════════════════════
`;
