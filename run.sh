#!/usr/bin/env bash
# Byte Wave — start both the API server and the frontend dev server.
# Run from the project root: ./run.sh

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

# ── Backend (FastAPI on :8000) ────────────────────────────────────────────────
echo "Starting Byte Wave API on http://localhost:8000 …"
cd "$ROOT"
python -m uvicorn backend.main:app --reload --reload-dir backend --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# ── Frontend (Vite on :5173) ──────────────────────────────────────────────────
echo "Starting Byte Wave frontend on http://localhost:5173 …"
cd "$ROOT/frontend"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "  Backend  → http://localhost:8000"
echo "  Frontend → http://localhost:5173"
echo ""
echo "Press Ctrl-C to stop both servers."

# Wait for either process to exit, then kill both
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM
wait $BACKEND_PID $FRONTEND_PID
