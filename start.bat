@echo off
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

REM ---- Install Node packages if not installed ----
if not exist "node_modules\vite" (
    echo  [+] Installing Node.js packages... (first time only, may take a few minutes)
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

REM ---- Get local IP for display ----
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do (
    set LOCAL_IP=%%a
    goto :found_ip
)
:found_ip
set LOCAL_IP=%LOCAL_IP: =%

echo  -------------------------------------------------------
echo   Open in browser (this PC):     http://localhost:8000
echo   Open from other PCs (WiFi):    http://%LOCAL_IP%:8000
echo  -------------------------------------------------------
echo.
echo  Press Ctrl+C to stop the server.
echo.

cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000

pause
