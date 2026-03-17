import sqlite3

from document_store import DB_PATH, init_db


def main():
    init_db(DB_PATH)
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        tables = cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()
        print("DB Path:", DB_PATH)
        print("Tables:", [t[0] for t in tables])

        cursor.execute("PRAGMA integrity_check")
        print("Integrity:", cursor.fetchone()[0])

        cursor.execute("SELECT COUNT(*) FROM documents")
        doc_count = cursor.fetchone()[0]
        print(f"Documents: {doc_count}")

        cursor.execute("SELECT COUNT(*) FROM document_chunks")
        chunk_count = cursor.fetchone()[0]
        print(f"Chunks: {chunk_count}")

        cursor.execute("SELECT COUNT(*) FROM document_chunk_embeddings")
        emb_count = cursor.fetchone()[0]
        print(f"Embeddings: {emb_count}")

        if doc_count > 0:
            cursor.execute("SELECT document_id, file_name, num_chunks FROM documents")
            for doc_id, file_name, num_chunks in cursor.fetchall():
                cursor.execute("SELECT COUNT(*) FROM document_chunks WHERE document_id = ?", (doc_id,))
                saved = cursor.fetchone()[0]
                print(f"  {file_name}: {saved}/{num_chunks} chunks")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
