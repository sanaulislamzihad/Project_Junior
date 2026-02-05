from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import re
import difflib

def normalize_text(text: str) -> str:
    """Basic text normalization."""
    return text.lower().strip()

def calculate_similarity_score(source_text: str, corpus_texts: list) -> list:
    """
    Calculates similarity scores between source_text and a list of corpus_texts.
    
    Returns:
        list: A list of similarity scores (floats between 0 and 1) corresponding to corpus_texts.
    """
    if not source_text or not corpus_texts:
        return [0.0] * len(corpus_texts)
    
    documents = [source_text] + corpus_texts
    tfidf = TfidfVectorizer(stop_words='english')
    
    try:
        tfidf_matrix = tfidf.fit_transform(documents)
        # Compute cosine similarity between source (index 0) and all others
        cosine_sim = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:])
        return cosine_sim[0].tolist()
    except ValueError:
        # Handle cases with empty vocabulary or other errors
        return [0.0] * len(corpus_texts)

def find_highlighting_matches(source_text: str, comparison_text: str, threshold=0.8):
    """
    Identifies matching segments between source and comparison text for highlighting.
    Uses SequenceMatcher for a robust diff-like comparison.
    """
    matcher = difflib.SequenceMatcher(None, source_text, comparison_text, autojunk=False)
    matches = []
    
    # get_matching_blocks returns triples (i, j, n)
    # i: input start, j: match start in comparison, n: length
    for match in matcher.get_matching_blocks():
        i, j, n = match
        # Filter out very small trivial matches (like single words or spaces)
        if n > 10:  # arbitrary character length threshold to avoid noise
            segment = source_text[i:i+n]
            matches.append({
                "start": i,
                "end": i + n,
                "text": segment,
                "source_match_start": j
            })
            
    return matches
