"""
SQLite store for document metadata, chunks, and embeddings (repository documents).
"""
import os
import sqlite3
from datetime import datetime, timezone
from typing import List, Optional

# Always save in week2/ folder (same as auth.db), regardless of where server is run from
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.abspath(os.path.join(_THIS_DIR, "..", "documents.db"))


def get_connection(db_path: str = DB_PATH):
    return sqlite3.connect(db_path)


def _ensure_repo_columns(cursor) -> None:
    """Add repo_type, owner_id, and model_name columns if missing (migration)."""
    cursor.execute("PRAGMA table_info(documents)")
    cols = [r[1] for r in cursor.fetchall()]
    if "repo_type" not in cols:
        cursor.execute("ALTER TABLE documents ADD COLUMN repo_type TEXT NOT NULL DEFAULT 'university'")
    if "owner_id" not in cols:
        cursor.execute("ALTER TABLE documents ADD COLUMN owner_id INTEGER NULL")
    if "model_name" not in cols:
        cursor.execute("ALTER TABLE documents ADD COLUMN model_name TEXT NOT NULL DEFAULT 'default'")


def init_db(db_path: str = DB_PATH) -> None:
    """Create documents and document_chunks tables if not exist."""
    conn = get_connection(db_path)
    cursor = conn.cursor()
    # Metadata structure (TEXT_PROCESSING_PLAN §5) + repo: university (admin) | personal (teacher)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS documents (
            document_id TEXT PRIMARY KEY,
            file_name TEXT NOT NULL,
            file_path TEXT NOT NULL,
            num_chunks INTEGER NOT NULL,
            indexing_time REAL NOT NULL,
            file_type TEXT NOT NULL,
            num_pages_or_slides INTEGER DEFAULT 0,
            raw_text_length INTEGER DEFAULT 0,
            indexed_at TEXT NOT NULL,
            repo_type TEXT NOT NULL DEFAULT 'university',
            owner_id INTEGER NULL,
            model_name TEXT NOT NULL DEFAULT 'default'
        )
    """)
    # Migration for existing DBs that don't have repo columns
    try:
        _ensure_repo_columns(cursor)
    except sqlite3.OperationalError:
        pass
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS document_chunks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id TEXT NOT NULL,
            chunk_index INTEGER NOT NULL,
            chunk_text TEXT NOT NULL,
            FOREIGN KEY (document_id) REFERENCES documents(document_id)
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS document_chunk_embeddings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id TEXT NOT NULL,
            chunk_index INTEGER NOT NULL,
            embedding BLOB NOT NULL,
            FOREIGN KEY (document_id) REFERENCES documents(document_id)
        )
    """)
    conn.commit()
    conn.close()


def save_document(
    document_id: str,
    file_name: str,
    file_path: str,
    num_chunks: int,
    indexing_time: float,
    file_type: str,
    num_pages_or_slides: int,
    raw_text_length: int,
    chunks: List[str],
    repo_type: str = "university",
    owner_id: int = None,
    embeddings: Optional[List[bytes]] = None,
    model_name: str = "default",
    db_path: str = DB_PATH,
) -> None:
    """Save document metadata, chunks, and optional embeddings. embeddings: list of bytes (numpy float32 .tobytes())."""
    init_db(db_path)
    indexed_at = datetime.now(timezone.utc).isoformat()
    conn = get_connection(db_path)
    cursor = conn.cursor()
    try:
        cursor.execute(
            """INSERT INTO documents (
                document_id, file_name, file_path, num_chunks, indexing_time,
                file_type, num_pages_or_slides, raw_text_length, indexed_at,
                repo_type, owner_id, model_name
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                document_id,
                file_name,
                file_path,
                num_chunks,
                indexing_time,
                file_type,
                num_pages_or_slides,
                raw_text_length,
                indexed_at,
                repo_type,
                owner_id,
                model_name,
            ),
        )
        for i, text in enumerate(chunks):
            cursor.execute(
                "INSERT INTO document_chunks (document_id, chunk_index, chunk_text) VALUES (?, ?, ?)",
                (document_id, i, text),
            )
        if embeddings:
            for i, emb_blob in enumerate(embeddings):
                if i < len(chunks):
                    cursor.execute(
                        "INSERT INTO document_chunk_embeddings (document_id, chunk_index, embedding) VALUES (?, ?, ?)",
                        (document_id, i, emb_blob),
                    )
        conn.commit()
        # Invalidate FAISS cache for this repo so next similarity search rebuilds index from DB.
        try:
            from faiss_index import invalidate_cached_index, invalidate_all_cached_indexes
            if repo_type == "university":
                invalidate_all_cached_indexes()
            else:
                invalidate_cached_index(repo_type, owner_id, model_name)
                invalidate_cached_index("both", owner_id, model_name)
        except Exception:
            pass
    finally:
        conn.close()


def get_stats(db_path: str = DB_PATH):
    """Return document and chunk counts."""
    init_db(db_path)
    conn = get_connection(db_path)
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT COUNT(*) FROM documents")
        doc_count = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM document_chunks")
        chunk_count = cursor.fetchone()[0]
        return {"document_count": doc_count, "chunk_count": chunk_count}
    except Exception:
        return None
    finally:
        conn.close()


def get_chunks_with_embeddings(repo_type: str = "university", owner_id: int = None, model_name: str = "default", db_path: str = DB_PATH):
    """Get chunks with embeddings for semantic similarity scan, filtered by model_name."""
    init_db(db_path)
    conn = get_connection(db_path)
    cursor = conn.cursor()
    try:
        if repo_type == "both" and owner_id is not None:
            cursor.execute(
                """SELECT dc.document_id, d.file_name, dc.chunk_index, dc.chunk_text, ce.embedding
                   FROM document_chunks dc
                   JOIN documents d ON dc.document_id = d.document_id
                   LEFT JOIN document_chunk_embeddings ce ON dc.document_id = ce.document_id AND dc.chunk_index = ce.chunk_index
                   WHERE (d.repo_type = 'university' OR (d.repo_type = 'personal' AND d.owner_id = ?))
                     AND d.model_name = ?""",
                (owner_id, model_name)
            )
        elif repo_type == "personal" and owner_id is not None:
            cursor.execute(
                """SELECT dc.document_id, d.file_name, dc.chunk_index, dc.chunk_text, ce.embedding
                   FROM document_chunks dc
                   JOIN documents d ON dc.document_id = d.document_id
                   LEFT JOIN document_chunk_embeddings ce ON dc.document_id = ce.document_id AND dc.chunk_index = ce.chunk_index
                   WHERE d.repo_type = ? AND d.owner_id = ? AND d.model_name = ?""",
                (repo_type, owner_id, model_name)
            )
        else:
            cursor.execute(
                """SELECT dc.document_id, d.file_name, dc.chunk_index, dc.chunk_text, ce.embedding
                   FROM document_chunks dc
                   JOIN documents d ON dc.document_id = d.document_id
                   LEFT JOIN document_chunk_embeddings ce ON dc.document_id = ce.document_id AND dc.chunk_index = ce.chunk_index
                   WHERE d.repo_type = 'university' AND d.model_name = ?""",
                (model_name,)
            )
        rows = cursor.fetchall()
        return [
            {"document_id": r[0], "file_name": r[1], "chunk_index": r[2], "chunk_text": r[3] or "", "embedding": r[4]}
            for r in rows
        ]
    finally:
        conn.close()


def get_chunks_for_scan(repo_type: str = "university", owner_id: int = None, db_path: str = DB_PATH):
    """Get chunks for similarity scan (no embeddings, legacy)."""
    init_db(db_path)
    conn = get_connection(db_path)
    cursor = conn.cursor()
    try:
        if repo_type == "both" and owner_id is not None:
            cursor.execute(
                """SELECT dc.document_id, dc.chunk_index, dc.chunk_text
                   FROM document_chunks dc
                   JOIN documents d ON dc.document_id = d.document_id
                   WHERE d.repo_type = 'university' OR (d.repo_type = 'personal' AND d.owner_id = ?)""",
                (owner_id,)
            )
        elif repo_type == "personal" and owner_id is not None:
            cursor.execute(
                """SELECT dc.document_id, dc.chunk_index, dc.chunk_text
                   FROM document_chunks dc
                   JOIN documents d ON dc.document_id = d.document_id
                   WHERE d.repo_type = ? AND d.owner_id = ?""",
                (repo_type, owner_id)
            )
        else:
            cursor.execute(
                """SELECT dc.document_id, dc.chunk_index, dc.chunk_text
                   FROM document_chunks dc
                   JOIN documents d ON dc.document_id = d.document_id
                   WHERE d.repo_type = 'university'"""
            )
        rows = cursor.fetchall()
        return [{"document_id": r[0], "chunk_index": r[1], "chunk_text": r[2]} for r in rows]
    finally:
        conn.close()


def filename_exists(file_name: str, repo_type: str = "university", owner_id: int = None, db_path: str = DB_PATH) -> bool:
    """Check if a document with the same file_name already exists in the given repo."""
    init_db(db_path)
    conn = get_connection(db_path)
    cursor = conn.cursor()
    try:
        if repo_type == "personal" and owner_id is not None:
            cursor.execute(
                "SELECT COUNT(*) FROM documents WHERE file_name = ? AND repo_type = ? AND owner_id = ?",
                (file_name, repo_type, owner_id)
            )
        else:
            cursor.execute(
                "SELECT COUNT(*) FROM documents WHERE file_name = ? AND repo_type = 'university'",
                (file_name,)
            )
        return cursor.fetchone()[0] > 0
    finally:
        conn.close()


def list_documents(repo_type: str = "university", owner_id: int = None, db_path: str = DB_PATH):
    """List documents. admin: repo_type=university, owner_id=None; teacher: repo_type=personal, owner_id=teacher_id."""
    init_db(db_path)
    conn = get_connection(db_path)
    cursor = conn.cursor()
    try:
        if repo_type == "personal" and owner_id is not None:
            cursor.execute(
                """SELECT document_id, file_name, file_type, num_chunks, num_pages_or_slides, indexed_at, model_name
                   FROM documents WHERE repo_type = ? AND owner_id = ? ORDER BY indexed_at DESC""",
                (repo_type, owner_id)
            )
        else:
            cursor.execute(
                """SELECT document_id, file_name, file_type, num_chunks, num_pages_or_slides, indexed_at, model_name
                   FROM documents WHERE repo_type = 'university' ORDER BY indexed_at DESC"""
            )
        rows = cursor.fetchall()
        return [
            {"document_id": r[0], "file_name": r[1], "file_type": r[2], "num_chunks": r[3], "num_pages_or_slides": r[4], "indexed_at": r[5], "model_name": r[6] or "default"}
            for r in rows
        ]
    finally:
        conn.close()


def delete_document(document_id: str, db_path: str = DB_PATH) -> bool:
    """Delete document and its chunks. Returns True if deleted."""
    init_db(db_path)
    conn = get_connection(db_path)
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT COUNT(*) FROM documents WHERE document_id = ?", (document_id,))
        exists = cursor.fetchone()[0] > 0
        cursor.execute("DELETE FROM document_chunk_embeddings WHERE document_id = ?", (document_id,))
        cursor.execute("DELETE FROM document_chunks WHERE document_id = ?", (document_id,))
        cursor.execute("DELETE FROM documents WHERE document_id = ?", (document_id,))
        conn.commit()
        try:
            from faiss_index import invalidate_all_cached_indexes
            invalidate_all_cached_indexes()
        except Exception:
            pass
        return exists
    finally:
        conn.close()

def update_document_path(document_id: str, new_path: str, repo_type: str = "university", owner_id: int = None, db_path: str = DB_PATH) -> bool:
    """Update the file_name (path) of a document. Returns True if updated."""
    init_db(db_path)
    conn = get_connection(db_path)
    cursor = conn.cursor()
    try:
        if repo_type == "personal" and owner_id is not None:
            cursor.execute("UPDATE documents SET file_name = ? WHERE document_id = ? AND repo_type = ? AND owner_id = ?", (new_path, document_id, repo_type, owner_id))
        else:
            cursor.execute("UPDATE documents SET file_name = ? WHERE document_id = ? AND repo_type = 'university'", (new_path, document_id))
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()
