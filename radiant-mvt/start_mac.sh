#!/bin/bash
# Radiant-MVT™ Trading Intelligence Platform — Mac Launcher
# Run: bash start_mac.sh

cd "$(dirname "$0")"

echo "╔══════════════════════════════════════════════════════╗"
echo "║  Radiant-MVT™ Trading Intelligence Platform          ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Check Python version
PYTHON=$(which python3 || which python)
echo "Python: $($PYTHON --version)"

# Seed DB if needed
$PYTHON -c "
import sys; sys.path.insert(0, '.')
from database.db import init_db; init_db()
from database.seed.seed_all import run_all_seeds; run_all_seeds()
" 2>/dev/null && echo "✅ Database ready" || echo "⚠️  DB seed skipped"

echo ""
echo "Server starting on http://localhost:8000"
echo "Login: alex.chen@ineos-ts.com / Trader2026!"
echo "Press Ctrl+C to stop."
echo ""

# Open browser after 3 seconds
(sleep 3 && open http://localhost:8000) &

$PYTHON -m uvicorn main:app --host 0.0.0.0 --port 8000 --log-level info
