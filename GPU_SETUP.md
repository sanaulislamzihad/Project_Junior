# GPU Acceleration Setup Guide

This project is optimized to run semantic similarity and embedding generation on your **NVIDIA GPU** using CUDA. Following these steps will offload heavy processing from your CPU to your GPU, making document scans significantly faster.

## Prerequisites

1.  **NVIDIA GPU**: An RTX or GTX series card.
2.  **Latest Drivers**: Ensure your NVIDIA drivers are up to date.
3.  **Python 3.12 or 3.11**: **Do not use Python 3.14** yet, as official CUDA-enabled PyTorch binaries are not yet available for it on Windows.

---

## Installation Steps (Windows)

### 1. Create a Compatible Virtual Environment
Navigate to the `backend/` folder and create a virtual environment using Python 3.12:

```powershell
# In the backend directory
py -3.12 -m venv venv
```

### 2. Install Project Dependencies
Activate the environment and install the base requirements:

```powershell
.\venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Install CUDA-Enabled PyTorch
The standard `pip install torch` often installs the CPU-only version. To get GPU support, run the following command to install the CUDA 12.1 compatible build:

```powershell
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121 --force-reinstall
```

### 4. Verify GPU Support
Run this command to confirm that your project can see your GPU:

```powershell
python -c "import torch; print('CUDA available:', torch.cuda.is_available()); print('Device:', torch.cuda.get_device_name(0))"
```

You should see:
`CUDA available: True`
`Device: NVIDIA GeForce RTX ...`

---

---

## How to Run the Project (Step-by-Step)

Once everything is installed, follow these steps to start both the backend and frontend:

### 1. Start the Backend (with GPU support)
Open a terminal in the project root and run:
```powershell
cd backend
.\venv\Scripts\python.exe -m uvicorn main:app --reload
```
*Wait for the message: `Application startup complete.`*

### 2. Start the Frontend
Open a **new** terminal in the project root and run:
```powershell
npm install   # Only needed the first time
npm run dev
```
*The output will show: `➜ Local: http://localhost:5173/`*

### 3. Open in Browser
Visit **http://localhost:5173/** to start scanning documents!

---

## Troubleshooting

- **ModuleNotFoundError**: If you see "No module named 'sse_starlette'", ensure you have run the latest `pip install -r requirements.txt` or manually run `pip install sse-starlette`.
- **CUDA Available: False**: 
    - Check if you have Python 3.14 installed as default (it won't work with GPU yet). 
    - Ensure your NVIDIA drivers are version 527.41 or higher.
