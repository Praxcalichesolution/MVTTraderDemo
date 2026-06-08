@echo off
echo ============================================================
echo   Radiant-MVT -- Trading Intelligence Platform
echo   URL  : http://localhost:8001
echo   Docs : http://localhost:8001/api/docs
echo   Stop : Ctrl+C
echo ============================================================

cd /d "%~dp0"

:: Kill anything still on 8000 or 8001
echo Freeing ports...
for /f "tokens=5" %%P in ('netstat -aon ^| findstr ":8000 " ^| findstr LISTENING') do taskkill /F /PID %%P >nul 2>&1
for /f "tokens=5" %%P in ('netstat -aon ^| findstr ":8001 " ^| findstr LISTENING') do taskkill /F /PID %%P >nul 2>&1
timeout /t 1 /nobreak >nul

:: Load .env variables
for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
    set "%%A=%%B"
)

set PYTHONPATH=%~dp0

echo Installing dependencies...
python -m pip install -r requirements.txt --quiet
python -m pip install pyodbc --quiet

echo.
echo Starting server...
python -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload --log-level info

pause
