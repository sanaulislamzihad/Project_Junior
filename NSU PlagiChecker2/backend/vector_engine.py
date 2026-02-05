import faiss
import numpy as np
import os
import pickle
from sentence_transformers import SentenceTransformer
from typing import List, Dict, Tuple
from database import DatabaseManager

class VectorEngine:
    def __init__(self, db_manager: DatabaseManager, model_name='paraphrase-MiniLM-L6-v2'):
        print("Loading Embedding Model...")
        self.model = SentenceTransformer(model_name)
        self.dimension = 384 # Dimension for MiniLM-L6-v2
        self.db = db_manager
        self.index_path = "faiss_index.bin"
        self.mapping_path = "chunk_mapping.pkl"
        
        # We need to map FAISS sequential IDs back to (doc_id, chunk_index)
        # IDs in FAISS are 0, 1, 2... corresponding to the order of addition.
        self.id_mapping = {} # faiss_id -> {'doc_id': int, 'chunk_index': int}
        
        self.load_index()

    def load_index(self):
        if os.path.exists(self.index_path) and os.path.exists(self.mapping_path):
            self.index = faiss.read_index(self.index_path)
            with open(self.mapping_path, 'rb') as f:
                self.id_mapping = pickle.load(f)
            print(f"Loaded FAISS index with {self.index.ntotal} vectors.")
        else:
            self.index = faiss.IndexFlatIP(self.dimension) # Inner Product (= Cosine Sim if normalized)
            self.id_mapping = {}
            print("Created new FAISS index.")

    def save_index(self):
        faiss.write_index(self.index, self.index_path)
        with open(self.mapping_path, 'wb') as f:
            pickle.dump(self.id_mapping, f)

    def process_and_index_document(self, filename: str, text: str):
        """
        Chunks text, generates embeddings, updates DB, and adds to FAISS.
        """
        # 1. Register Document
        doc_id = self.db.add_document(filename)
        
        # 2. Chunk Text
        chunks = self._chunk_text(text)
        if not chunks:
            return

        # 3. Store Chunks in SQLite
        self.db.add_chunks(doc_id, chunks)

        # 4. Generate Embeddings
        texts = [c['text'] for c in chunks]
        embeddings = self.model.encode(texts)
        faiss.normalize_L2(embeddings) # Normalize for Cosine Similarity

        # 5. Add to FAISS and Update Mapping
        start_id = self.index.ntotal
        self.index.add(embeddings)
        
        for i, chunk in enumerate(chunks):
            faiss_id = start_id + i
            self.id_mapping[faiss_id] = {
                'doc_id': doc_id,
                'chunk_index': i,
                'start': chunk['start'],
                'end': chunk['end']
            }
        
        self.save_index()
        print(f"Indexed {filename}: {len(chunks)} chunks added.")

    def search(self, query_text: str, top_k=5, threshold=0.4) -> List[Dict]:
        """
        Searches for similar chunks in the repository.
        """
        # Embed query (chunking query if large is advanced, here we assume short segments or chunk query too)
        # For simplicity in this version, we assume query is chunked by caller or is a single segment.
        # Actually, let's chunk the query too to find matches for parts of the document.
        
        query_chunks = self._chunk_text(query_text, window_size=300, overlap=50)
        results = []

        if not query_chunks:
            return []

        # We will collect all matches for all query chunks
        for q_chunk in query_chunks:
            q_emb = self.model.encode([q_chunk['text']])
            faiss.normalize_L2(q_emb)
            
            # Search
            D, I = self.index.search(q_emb, k=top_k)
            
            for rank, (score, idx) in enumerate(zip(D[0], I[0])):
                if idx in self.id_mapping and score >= threshold:
                    meta = self.id_mapping[idx]
                    doc_filename = self.db.get_filename(meta['doc_id'])
                    
                    # Fetch actual text from DB (optional, or we can rely on what we sent if we index carefully)
                    # For now, let's just return metadata and score
                    # A real system might fetch the snippet from DB
                    
                    results.append({
                        'score': float(score),
                        'filename': doc_filename,
                        'chunk_text': self._get_chunk_text_from_db(meta['doc_id'], meta['chunk_index']), # Helper needed
                        'match_doc_id': meta['doc_id'],
                        'chunk_index': meta['chunk_index']
                    })

        return results

    def _get_chunk_text_from_db(self, doc_id, chunk_index):
        # Quick helper, suboptimal but works
        chunks = self.db.get_document_chunks(doc_id)
        for c in chunks:
            if c['index'] == chunk_index:
                return c['text']
        return ""

    def _chunk_text(self, text: str, window_size=500, overlap=100) -> List[Dict]:
        """
        Sliding window chunking.
        Returns list of {'text': str, 'start': int, 'end': int}
        """
        chunks = []
        if not text:
            return chunks
            
        start = 0
        text_len = len(text)
        
        while start < text_len:
            end = min(start + window_size, text_len)
            
            # Try to break at a space if not at end
            if end < text_len:
                last_space = text.rfind(' ', start, end)
                if last_space != -1 and last_space > start + (window_size // 2):
                    end = last_space
            
            chunk_text = text[start:end].strip()
            if len(chunk_text) > 20: # Ignore tiny chunks
                chunks.append({
                    'text': chunk_text,
                    'start': start,
                    'end': end
                })
            
            start += (window_size - overlap)
            
        return chunks
