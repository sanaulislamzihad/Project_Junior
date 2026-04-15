# NSU PlagiChecker — University Plagiarism Detection System

A university-wide plagiarism detection system that runs entirely on your **local network (LAN)**. No internet required after setup. Only devices connected to the university WiFi/LAN can access it.

---

## How It Works

One PC acts as the **server** (teacher's PC). All other PCs just open a browser — nothing to install on their side.

```
Teacher's PC (Server)
├── Double-click start.bat → server starts automatically
├── Hosts the website + database
└── All comparisons happen here

Student's PC / Other Teacher's PC
└── Open browser → type server IP → done
```

---

## Roles

| Role | What they can do |
|------|-----------------|
| **Admin** | Manage users (add/remove teachers & students), upload to University Repo |
| **Teacher** | Upload to Personal DB, check plagiarism against University / Personal / Both |
| **Student** | Submit documents, compare against University Repo only |

> - Only **Admin** can upload to the University Repository
> - **Teachers** upload to their own Personal DB only
> - **Students** always compare against University Repo only — no other option

---

## Requirements (Server PC only)

| Software | Download |
|----------|----------|
| Python 3.10+ | https://python.org |
| Node.js 18+ | https://nodejs.org |

> Students and other teachers do **not** need to install anything — just a browser.

---

## How to Use

### Step 1 — Start the Server

Double-click **`start.bat`**

It will automatically:
- Create Python virtual environment
- Install all Python packages
- Detect NVIDIA GPU → install GPU-accelerated PyTorch (faster AI)
- Install Node.js packages
- Build the frontend
- Start the server in the background

> **First time only:** takes 5–15 minutes (downloads packages + AI model ~500MB).
> **Every time after:** starts in a few seconds.

---

### Step 2 — Get the Server IP

After `start.bat` runs, it shows:

```
-------------------------------------------------------
 Share one of these links with students:
-------------------------------------------------------

  This PC only:
    http://localhost:8000

  Other PCs on the network (use any of these):
    http://172.20.96.214:8000
    http://10.100.5.221:8000

-------------------------------------------------------
```

Share the correct link with students based on which network they are on.

> You can close the `start.bat` window after this — the server keeps running in the background.

---

### Step 3 — Open in Browser

| Device | What to do |
|--------|-----------|
| Server PC | Open `http://localhost:8000` |
| Student / Teacher PC | Open the IP shown in Step 2 |

All PCs must be on the **same WiFi or LAN network**.

---

### Step 4 — Stop the Server

Double-click **`stop.bat`** when you want to shut down the server.

---

## GPU Acceleration (Automatic)

`start.bat` automatically detects your GPU and installs the right version:

| GPU Status | What happens |
|-----------|-------------|
| NVIDIA GPU found | Installs CUDA PyTorch → runs AI on GPU (FAST) |
| No GPU | Uses CPU (slower but works fine) |

Output when GPU is detected:
```
[GPU] NVIDIA GeForce RTX 3060 | VRAM: 12288 MiB
[+] Running in GPU MODE - FAST!
```

> GPU PyTorch install requires internet — **one time only**.

---

## Background Processing (Logout & Come Back)

Teachers can upload many files and **log out** — processing continues in the background.

```
Upload 50 files → Logout → Go for lunch
Come back → Login → All results are ready
```

Results are saved to the database automatically. They appear in the **Processing Queue** when you log back in, marked as **"Saved Result"**.

> The server (`start.bat`) must stay running while files are being processed.

---

## Network Access

| Network | Can access? |
|---------|------------|
| University WiFi | ✅ Yes |
| University LAN (cable) | ✅ Yes |
| Mobile data | ❌ No |
| Home WiFi | ❌ No (unless connected to university VPN) |

No extra configuration needed — private IPs are only reachable from the same network.

---

## Default Login Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@nsu.edu` | `admin123` |
| Teacher (demo) | `rahman@nsu.edu` | `teacher123` |
| Student (demo) | `fahim.ahmed@northsouth.edu` | `student123` |

> Change these after first login.

---

## Adding Users

**Teachers** must be added by Admin:
- Login as Admin → Admin Dashboard → Add Teacher

**Students** can self-register:
- Login page → click **"Register here"**

---

## Troubleshooting

**Server not accessible from other PCs:**
- Make sure `start.bat` has been run and the background window is open
- All PCs must be on the same WiFi/LAN
- Check the correct IP from the list shown by `start.bat`

**IP address changed (after reconnecting to WiFi):**
- Run `start.bat` again — it will show the new IP
- No rebuild needed (relative URLs are used)

**GPU install failed / want to retry:**
- Delete `.venv` folder
- Run `start.bat` again

**`stop.bat` did not stop the server:**
- Open Task Manager → find `python.exe` → End Task

**First run is slow (~500MB download):**
- AI model downloads once and is cached in `backend/model_cache/`
- All future runs are fully offline and instant

---

## Project Structure

```
project/
├── start.bat             ← Double-click to start server
├── stop.bat              ← Double-click to stop server
├── .env                  ← API URL config (leave empty for auto)
├── dist/                 ← Built frontend (auto-generated)
├── backend/
│   ├── main.py           ← FastAPI server + frontend serving
│   ├── database.py       ← User accounts + saved job results
│   ├── document_store.py ← Document repository
│   ├── embedding_pipeline.py  ← AI similarity (GPU/CPU auto)
│   ├── faiss_index.py    ← Fast vector search
│   ├── model_cache/      ← Downloaded AI model (offline)
│   └── requirements.txt  ← Python dependencies
├── src/                  ← React frontend source
├── auth.db               ← User database
└── documents.db          ← Document repository database
```

---

## Similarity Score Guide

| Score | Meaning |
|-------|---------|
| **0% – 29%** | Low — document appears mostly original |
| **30% – 59%** | Moderate — some sections match, review recommended |
| **60% – 100%** | High — significant overlap detected |

> A high score does not automatically mean plagiarism. A human reviewer makes the final decision.

---

## How the AI Detection Works

Four algorithms combined:

| Algorithm | Weight | Detects |
|-----------|--------|---------|
| AI Semantic (deep learning) | 60% | Paraphrasing, same meaning |
| Lexical (word overlap) | 15% | Direct copy-paste |
| Winnowing (MOSS algorithm) | 15% | Structural copying |
| Fingerprint (n-gram) | 10% | Partial phrase copying |

---

*© 2026 North South University — Academic Integrity System*
