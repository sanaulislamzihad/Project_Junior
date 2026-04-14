# NSU PlagiChecker — University Plagiarism Detection System

A university-wide plagiarism detection system that runs entirely on your **local network (LAN)**. No internet required. Only devices connected to the university WiFi can access it.

---

## How It Works

One PC acts as the **server** (usually the teacher's PC). All other PCs just open a browser — nothing to install on their side.

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
| **Admin** | Manage users (add/remove teachers & students) |
| **Teacher** | Upload to University Repo or Personal DB, check plagiarism |
| **Student** | Submit documents, compare against University Repo only |

> Student submissions are only compared against the **University Repository** — not against any teacher's personal database.

---

## Requirements (Server PC only)

Before using, make sure these two are installed on the **server PC**:

| Software | Download |
|----------|----------|
| Python 3.10+ | https://python.org |
| Node.js 18+ | https://nodejs.org |

> Students and other teachers do **not** need to install anything.

---

## How to Use

### Server PC (Teacher's PC)

**Step 1 — Find your IP address**

Open Command Prompt and run:
```
ipconfig
```
Look for **IPv4 Address** under your WiFi:
```
Wireless LAN adapter Wi-Fi:
   IPv4 Address. . . : 192.168.1.105   ← write this down
```

**Step 2 — Set your IP in the `.env` file**

Open the `.env` file in the project folder and change the line:
```
VITE_API_URL=http://192.168.1.105:8000
```
> Replace `192.168.1.105` with your actual IP from Step 1.

**Step 3 — Start the server**

Double-click **`start.bat`**

- First time: it will automatically install all required packages and build the frontend. This may take **5–10 minutes**.
- Every time after that: server starts in a few seconds.

The window will show:
```
  -------------------------------------------------------
   Open in browser (this PC):     http://localhost:8000
   Open from other PCs (WiFi):    http://192.168.1.105:8000
  -------------------------------------------------------
```

> Keep this window open while the server is running. Do not close it.

---

### Student PC / Other Teacher PC

No installation needed. Just:

1. Connect to **university WiFi**
2. Open any browser (Chrome, Edge, Firefox)
3. Type the server address in the address bar:
```
http://192.168.1.105:8000
```
> Ask your teacher for the correct IP address.

4. Login and start using the system

---

## Default Login Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@nsu.edu` | `admin123` |
| Teacher (demo) | `rahman@nsu.edu` | `teacher123` |
| Student (demo) | `fahim.ahmed@northsouth.edu` | `student123` |

> Change these passwords after first login.

---

## Adding Users

**Teachers** must be added by Admin:
1. Login as Admin → Admin Dashboard → Add Teacher

**Students** can self-register:
1. Go to login page → click **"Register here"**

---

## Teacher: Upload Options

In the **Repository Manager** tab, teachers see two upload options:

| Option | What it does |
|--------|-------------|
| **My Personal DB** | Only visible to you |
| **University Repo** | Shared — student submissions are compared against this |

---

## Troubleshooting

**IP address changed after restart:**
- Run `ipconfig` again on the server PC
- Update `.env` with the new IP
- Delete the `dist/` folder
- Run `start.bat` again (it will rebuild automatically)

**Students cannot connect:**
- Make sure `start.bat` window is open on the server PC
- Make sure all PCs are on the **same WiFi network**
- Double check the IP in the browser matches the server PC's IP

**First run downloads AI model (~500MB) — this is normal:**
- Happens once only, future runs are instant

**`start.bat` shows Python/Node.js not found:**
- Install Python from https://python.org
- Install Node.js from https://nodejs.org
- Run `start.bat` again

---

## Project Structure

```
project/
├── start.bat             ← Double-click to start (use this every time)
├── .env                  ← Set server IP here
├── dist/                 ← Built frontend (auto-generated)
├── backend/
│   ├── main.py           ← FastAPI server
│   ├── database.py       ← User accounts
│   ├── document_store.py ← Document storage
│   └── requirements.txt  ← Python dependencies
├── src/                  ← React frontend source code
├── auth.db               ← User database
└── documents.db          ← Document repository
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

## How the Similarity Detection Works

The system uses **4 algorithms** combined:

| Algorithm | Weight | Detects |
|-----------|--------|---------|
| AI Semantic (deep learning) | 60% | Paraphrasing, same meaning different words |
| Lexical (word overlap) | 15% | Direct copy-paste |
| Winnowing (MOSS algorithm) | 15% | Structural copying |
| Fingerprint (n-gram) | 10% | Partial phrase copying |

---

*© 2026 North South University — Academic Integrity System*
