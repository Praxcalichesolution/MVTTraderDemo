#!/bin/bash
# ── Radiant-MVT Backend ───────────────────────────────────────────────────────
# Starts FastAPI on http://localhost:8000
# Usage: ./start_backend.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "============================================================"
echo "  Radiant-MVT — Backend API Server"
echo "  URL  : http://localhost:8000"
echo "  Docs : http://localhost:8000/api/docs"
echo "  Log  : backend.log"
echo "  Stop : Ctrl+C"
echo "============================================================"

# Tee output to both terminal and log file
python3 -m uvicorn main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --reload \
    --log-level info \
    --access-log \
    2>&1 | tee -a backend.log
