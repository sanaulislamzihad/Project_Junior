@echo off
title NSU PlagiChecker - Stop Server
color 0C
echo.
echo  =====================================================
echo    NSU PlagiChecker - Stopping Server...
echo  =====================================================
echo.

REM Kill uvicorn process on port 8000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000" ^| findstr "LISTENING"') do (
    echo  [+] Stopping server (PID: %%a)...
    taskkill /PID %%a /F >nul 2>&1
)

REM Also kill by process name as backup
taskkill /IM "python.exe" /FI "WINDOWTITLE eq NSU PlagiChecker*" /F >nul 2>&1

echo  [+] Server stopped.
echo.
pause
