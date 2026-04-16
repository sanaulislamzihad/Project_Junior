@echo off
setlocal enabledelayedexpansion
title NSU PlagiChecker Server
color 0A
cd /d "%~dp0"

echo.
echo  =====================================================
echo    NSU PlagiChecker - University Plagiarism System
echo  =====================================================
echo.

REM ---- Check Python ----
python --version >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Python not found!
    echo  Please install Python 3.10+ from https://python.org
    pause
    exit /b 1
)

REM ---- Check Node.js ----
node --version >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Node.js not found!
    echo  Please install Node.js 18+ from https://nodejs.org
    pause
    exit /b 1
)

REM ---- Create virtual environment if not exists ----
if not exist ".venv\Scripts\activate.bat" (
    echo  [+] Creating Python virtual environment...
    python -m venv .venv
    if errorlevel 1 (
        echo  [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
    echo  [+] Done.
    echo.
)

REM ---- Activate virtual environment ----
call .venv\Scripts\activate.bat

REM ---- Install Python packages if not installed ----
python -c "import fastapi" >nul 2>&1
if errorlevel 1 (
    echo  [+] Installing Python packages... (first time only, may take a few minutes)
    pip install -r backend\requirements.txt
    if errorlevel 1 (
        echo  [ERROR] Python package installation failed.
        pause
        exit /b 1
    )
    echo  [+] Done.
    echo.
)

REM =====================================================
REM  GPU DETECTION + AUTO INSTALL CUDA PYTORCH
REM =====================================================
echo  [+] Checking for NVIDIA GPU...
nvidia-smi >nul 2>&1
if not errorlevel 1 (

    REM GPU found — check if CUDA PyTorch already installed
    python -c "import torch; exit(0 if torch.cuda.is_available() else 1)" >nul 2>&1
    if errorlevel 1 (
        echo  [+] NVIDIA GPU found! Installing GPU version of PyTorch...
        echo      (This requires internet — one time only)
        echo.

        REM Detect CUDA version from nvidia-smi
        set CUDA_VER=12
        for /f "tokens=9" %%v in ('nvidia-smi ^| findstr /i "CUDA Version"') do (
            set CUDA_FULL=%%v
            set CUDA_VER=!CUDA_FULL:~0,2!
        )

        echo  [+] Detected CUDA version: !CUDA_VER!

        REM Choose correct torch wheel based on CUDA version
        if "!CUDA_VER!"=="11" (
            echo  [+] Installing PyTorch for CUDA 11.8...
            pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118 -q
        ) else (
            echo  [+] Installing PyTorch for CUDA 12.4...
            pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124 -q
        )

        python -c "import torch; exit(0 if torch.cuda.is_available() else 1)" >nul 2>&1
        if errorlevel 1 (
            echo  [!] GPU PyTorch install failed. Falling back to CPU.
        ) else (
            echo  [+] GPU PyTorch ready!
        )
    ) else (
        echo  [+] GPU already configured.
    )

    REM Show GPU info
    for /f "tokens=1,* delims=," %%a in ('nvidia-smi --query-gpu^=name^,memory.total --format^=csv^,noheader 2^>nul') do (
        echo  [GPU] %%a ^| VRAM: %%b
    )
    echo  [+] Running in GPU MODE - FAST!

) else (
    echo  [!] No NVIDIA GPU found. Running on CPU.
)
echo.
REM =====================================================

REM ---- Install Node packages if not installed ----
if not exist "node_modules\vite" (
    echo  [+] Installing Node.js packages... (first time only)
    call npm install
    if errorlevel 1 (
        echo  [ERROR] npm install failed.
        pause
        exit /b 1
    )
    echo  [+] Done.
    echo.
)

REM ---- Build frontend if not built ----
if not exist "dist\index.html" (
    echo  [+] Building frontend... (first time only)
    call npm run build
    if errorlevel 1 (
        echo  [ERROR] Frontend build failed.
        pause
        exit /b 1
    )
    echo  [+] Done.
    echo.
)

REM ---- Show ALL network addresses ----
echo  -------------------------------------------------------
echo   Share one of these links with students:
echo  -------------------------------------------------------
echo.
echo   This PC only:
echo     http://localhost:8000
echo.
echo   Other PCs on the network (use any of these):

for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /i "IPv4"') do (
    set IP=%%A
    set IP=!IP: =!
    echo     http://!IP!:8000
)

echo.
echo  -------------------------------------------------------
echo   Students: open the link above in any browser
echo   Make sure everyone is on the same WiFi/LAN
echo  -------------------------------------------------------
echo.

REM ---- Launch server in a separate background window ----
echo  [+] Starting server in background...
cd backend
start "NSU PlagiChecker - DO NOT CLOSE" /min python -m uvicorn main:app --host 0.0.0.0 --port 8000

echo.
echo  [+] Server is running in the background.
echo  [+] You can close THIS window safely.
echo  [+] To STOP the server, run stop.bat
echo.
pause
