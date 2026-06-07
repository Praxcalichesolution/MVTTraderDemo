@echo off
echo ============================================================
echo   Radiant-MVT -- Trading Intelligence Platform
echo   URL  : http://localhost:8000
echo   Docs : http://localhost:8000/api/docs
echo   Stop : Ctrl+C
echo ============================================================

cd /d "%~dp0"

:: Load .env variables
for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
    set "%%A=%%B"
)

set PYTHONPATH=%~dp0

echo Installing dependencies...
python -m pip install -r requirements.txt --quiet

echo.
echo Starting server...
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload --log-level info

pause
