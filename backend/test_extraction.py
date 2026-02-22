import os
import sys
from text_pipeline import process_document

# Add the current directory to path if needed
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Check for command line arguments
if len(sys.argv) < 2:
    print(f"\nUsage: python {os.path.basename(__file__)} <path_to_pdf_or_pptx>")
    print(f"Example: python {os.path.basename(__file__)} \"C:\\Documents\\my_file.pdf\"\n")
    sys.exit(1)

# Get the path from the terminal argument
pdf_path = sys.argv[1]

print("="*60)
print(f"RUNNING TEXT EXTRACTION PIPELINE ON: {os.path.basename(pdf_path)}")
print("="*60)

try:
    chunks, meta, full_text = process_document(pdf_path)
    
    print("\n[SUCCESS] Extraction Complete.")
    print(f"File Type: {meta.file_type.upper()}")
    print(f"Detected Pages: {meta.num_pages_or_slides}")
    print(f"Raw Text Length: {meta.raw_text_length} characters")
    print(f"Num Chunks: {meta.num_chunks}")
    print(f"Run Speed: {meta.indexing_time} seconds")
    
    print(f"\n" + "-" * 30)
    print("ALL EXTRACTED CHUNKS:")
    print("-" * 30)
    
    for i, chunk in enumerate(chunks):
        chunk_text = chunk["text"] if isinstance(chunk, dict) else chunk
        print(f"Chunk {i+1}:\n{chunk_text}\n")
        
    print("="*60)
except Exception as e:
    print(f"[ERROR] {str(e)}")
