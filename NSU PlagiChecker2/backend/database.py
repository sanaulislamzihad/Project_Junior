import sqlite3
import os
from typing import List, Dict, Optional

DB_name = "rag_metadata.db"

class DatabaseManager:
    def __init__(self, db_path: str = DB_name):
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        """Initialize the SQLite database with required tables."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Table for Documents (files)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL UNIQUE,
                processed_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # Table for Text Chunks
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS chunks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                doc_id INTEGER NOT NULL,
                chunk_index INTEGER NOT NULL,
                text_content TEXT NOT NULL,
                start_char_idx INTEGER,
                FOREIGN KEY (doc_id) REFERENCES documents (id) ON DELETE CASCADE
            )
        ''')
        
        conn.commit()
        conn.close()

    def add_document(self, filename: str) -> int:
        """Adds a document to the DB and returns its ID."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        try:
            cursor.execute('INSERT OR IGNORE INTO documents (filename) VALUES (?)', (filename,))
            conn.commit()
            
            # Fetch the ID (whether newly created or existing)
            cursor.execute('SELECT id FROM documents WHERE filename = ?', (filename,))
            doc_id = cursor.fetchone()[0]
            return doc_id
        finally:
            conn.close()

    def add_chunks(self, doc_id: int, chunks: List[Dict]):
        """Adds multiple chunks for a document."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        try:
            # First clear existing chunks for this doc (if re-processing)
            cursor.execute('DELETE FROM chunks WHERE doc_id = ?', (doc_id,))
            
            data = [
                (doc_id, idx, c['text'], c.get('start', 0)) 
                for idx, c in enumerate(chunks)
            ]
            cursor.executemany(
                'INSERT INTO chunks (doc_id, chunk_index, text_content, start_char_idx) VALUES (?, ?, ?, ?)',
                data
            )
            conn.commit()
        finally:
            conn.close()

    def get_chunk_text(self, chunk_id: int) -> Optional[str]:
        """Retrieves text content for a specific chunk ID (Note: this ID is internal global ID)."""
        # Note: FAISS usually returns an index. We need to map FAISS index to DB ID if they differ.
        # For simplicity in this implementation, we will assume FAISS index corresponds to 
        # a row in a 'vectors' table or we just store metadata in RAM.
        # WAITING for vector_engine strategy. 
        # STRATEGY CHANGE: It's better to fetch by doc_id and chunk_index if we store that in FAISS.
        pass

    def get_document_chunks(self, doc_id: int) -> List[Dict]:
        """Get all chunks for a document."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('SELECT chunk_index, text_content, start_char_idx FROM chunks WHERE doc_id = ? ORDER BY chunk_index', (doc_id,))
        rows = cursor.fetchall()
        conn.close()
        return [{'index': r[0], 'text': r[1], 'start': r[2]} for r in rows]

    def get_chunk_text_by_index(self, doc_id: int, chunk_index: int) -> Optional[str]:
        """Retrieves text for a specific chunk index of a document."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('SELECT text_content FROM chunks WHERE doc_id = ? AND chunk_index = ?', (doc_id, chunk_index))
        row = cursor.fetchone()
        conn.close()
        return row[0] if row else None

    def get_doc_id(self, filename: str) -> Optional[int]:
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('SELECT id FROM documents WHERE filename = ?', (filename,))
        row = cursor.fetchone()
        conn.close()
        return row[0] if row else None

    def get_filename(self, doc_id: int) -> Optional[str]:
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('SELECT filename FROM documents WHERE id = ?', (doc_id,))
        row = cursor.fetchone()
        conn.close()
        return row[0] if row else None
