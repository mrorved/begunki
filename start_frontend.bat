@echo off
cd /d "%~dp0frontend"

echo [INFO] Starting frontend at http://localhost:3000
echo [INFO] Press Ctrl+C to stop
echo.
python -m http.server 3000

pause
