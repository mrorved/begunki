@echo off
cd /d "%~dp0backend"

if not exist "venv\Scripts\activate.bat" (
    echo [SETUP] Creating virtual environment...
    python -m venv venv
    if errorlevel 1 (
        echo [ERROR] Failed to create venv. Make sure Python 3.10+ is installed.
        pause
        exit /b 1
    )
)

echo [INFO] Activating venv...
call venv\Scripts\activate.bat

echo [INFO] Installing dependencies...
pip install -r requirements.txt -q

echo.
echo [INFO] Starting server at http://localhost:8000
echo [INFO] Swagger UI: http://localhost:8000/docs
echo [INFO] Press Ctrl+C to stop
echo.
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

pause
