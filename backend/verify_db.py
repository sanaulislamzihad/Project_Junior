import sqlite3
import os

db = os.path.join("..", "documents.db")
conn = sqlite3.connect(db)
cursor = conn.cursor()

tables = cursor.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
print("Tables:", [t[0] for t in tables])

cursor.execute("SELECT COUNT(*) FROM documents")
doc_count = cursor.fetchone()[0]
print(f"Documents: {doc_count}")

cursor.execute("SELECT COUNT(*) FROM document_chunks")
chunk_count = cursor.fetchone()[0]
print(f"Chunks: {chunk_count}")

if doc_count > 0:
    cursor.execute("SELECT document_id, file_name, num_chunks FROM documents")
    for doc_id, file_name, num_chunks in cursor.fetchall():
        cursor.execute("SELECT COUNT(*) FROM document_chunks WHERE document_id = ?", (doc_id,))
        saved = cursor.fetchone()[0]
        print(f"  {file_name}: {saved}/{num_chunks} chunks")

conn.close()
