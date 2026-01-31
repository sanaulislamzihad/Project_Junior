import requests
import os
from reportlab.pdfgen import canvas

# Create a test PDF that copies content from paper1
TEST_PDF = "test_plagiarism.pdf"
c = canvas.Canvas(TEST_PDF)
c.drawString(100, 750, "My Assignment")
c.drawString(100, 700, "Introduction to Artificial Intelligence. AI is the simulation of human intelligence processes by machines.")
c.save()

url = "http://localhost:8000/analyze"
files = {'file': open(TEST_PDF, 'rb')}

try:
    print(f"Sending {TEST_PDF} to {url}...")
    response = requests.post(url, files=files)
    print("Status Code:", response.status_code)
    print("Response JSON:", response.json())
except Exception as e:
    print("Error:", e)
finally:
    files['file'].close()
    if os.path.exists(TEST_PDF):
        os.remove(TEST_PDF)
