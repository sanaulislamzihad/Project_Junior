# NSU PlagiChecker

Full-stack plagiarism and semantic similarity checker with:
- FastAPI backend
- React + Vite frontend
- FAISS Top-K retrieval
- N-gram fingerprint verification
- Diff comparison endpoint

## Prerequisites

- Python 3.10+ (recommended)
- Node.js 18+ and npm
- Windows PowerShell / terminal

## Project Setup

Run from project root:

```bash
cd Project_Junior-master
```

### 1) Backend install

Create and activate a virtual environment (recommended):

```bash
python -m venv .venv
.\.venv\Scripts\activate
```

Install backend dependencies:

```bash
pip install -r backend/requirements.txt
```

### 2) Frontend install

In a second terminal (project root), install frontend dependencies:

```bash
npm install
```

## Run the app

### Terminal A - start backend

```bash
cd backend
python main.py
```

Backend runs on:
- `http://localhost:8000`

### Terminal B - start frontend

From project root:

```bash
npm run dev
```

Frontend runs on:
- `http://localhost:5173`

## Optional commands

- Frontend production build:
  ```bash
  npm run build
  ```
- Backend quick health check:
  - Open `http://localhost:8000/` in browser

## Notes

- Keep both backend and frontend running during use.
- If `vite` is not recognized, run `npm install` again in project root.
- If sentence-transformer model download is slow, retry once; first run can take longer.
