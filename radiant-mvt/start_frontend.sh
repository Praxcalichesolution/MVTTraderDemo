#!/bin/bash
# ── Radiant-MVT Frontend ──────────────────────────────────────────────────────
# Starts static file server on http://localhost:3000
# Usage: ./start_frontend.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "============================================================"
echo "  Radiant-MVT — Frontend Server"
echo "  URL  : http://localhost:3000"
echo "  API  : http://localhost:8000  (start backend separately)"
echo "  Log  : frontend.log"
echo "  Stop : Ctrl+C"
echo "============================================================"

python3 frontend_server.py 2>&1 | tee -a frontend.log
