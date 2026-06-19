@echo off
echo ============================================================
echo   Radiant - Risk
echo   URL     : http://localhost:8002
echo   Backend : http://localhost:8000
echo   Stop    : Ctrl+C
echo ============================================================

cd /d "%~dp0"

for /f "tokens=5" %%P in ('netstat -aon ^| findstr ":8002 " ^| findstr LISTENING') do taskkill /F /PID %%P >nul 2>&1
timeout /t 1 /nobreak >nul

if exist ".env" (
  for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
    set "%%A=%%B"
  )
)

set PYTHONPATH=%~dp0

for /f "tokens=5" %%P in ('netstat -aon ^| findstr ":8000 " ^| findstr LISTENING') do set BACKEND_PID=%%P
if not defined BACKEND_PID (
  start "Radiant Backend" /min cmd /c python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload --log-level info 1>uvicorn-8000.out.log 2>uvicorn-8000.err.log
  timeout /t 3 /nobreak >nul
)

python -m uvicorn risk_main:app --host 0.0.0.0 --port 8002 --reload --log-level info
