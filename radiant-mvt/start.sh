#!/bin/bash
echo "Starting Radiant-MVT Trading Intelligence Platform..."
cd "$(dirname "$0")"
export PYTHONPATH="$(pwd)"
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --log-level info
