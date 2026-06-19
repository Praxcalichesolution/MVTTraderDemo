@echo off
echo ============================================================
echo   Radiant Shared Backend
echo   API  : http://localhost:8000
echo   Docs : http://localhost:8000/api/docs
echo   Stop : Ctrl+C
echo ============================================================

cd /d "%~dp0"

for /f "tokens=5" %%P in ('netstat -aon ^| findstr ":8000 " ^| findstr LISTENING') do taskkill /F /PID %%P >nul 2>&1
timeout /t 1 /nobreak >nul

if exist ".env" (
  for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
    set "%%A=%%B"
  )
)

set PYTHONPATH=%~dp0

python -m pip install -r requirements.txt --quiet
python -m pip install pyodbc --quiet

python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload --log-level info
