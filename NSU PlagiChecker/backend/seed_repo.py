from reportlab.pdfgen import canvas
import os

REPO_PATH = "../nsu_repository"
os.makedirs(REPO_PATH, exist_ok=True)

samples = [
    ("paper1.pdf", "Introduction to Artificial Intelligence. AI is the simulation of human intelligence processes by machines."),
    ("paper2.pdf", "Data Structures and Algorithms. Arrays are a collection of items stored at contiguous memory locations."),
    ("paper3.pdf", "Deep Learning Research. Neural networks are computing systems inspired by the biological neural networks."),
    ("nsu_thesis_2024.pdf", "This is an example NSU thesis. The quick brown fox jumps over the lazy dog. Plagiarism is bad.")
]

for filename, text in samples:
    c = canvas.Canvas(os.path.join(REPO_PATH, filename))
    c.drawString(100, 750, filename)
    c.drawString(100, 700, text)
    c.save()
    print(f"Created {filename}")
