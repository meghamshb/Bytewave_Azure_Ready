#!/usr/bin/env bash
# Byte Wave — start the application.
#
# Usage:
#   ./run.sh          → development mode  (Vite dev server + FastAPI with hot-reload)
#   ./run.sh --prod   → production mode   (build frontend, serve everything from FastAPI)

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
MODE="${1:-dev}"

# ── Production mode ───────────────────────────────────────────────────────────
if [ "$MODE" = "--prod" ] || [ "$MODE" = "prod" ]; then
  echo "╔══════════════════════════════════════════╗"
  echo "║  Byte Wave — Production Mode             ║"
  echo "╚══════════════════════════════════════════╝"

  # Build frontend if dist/ is missing or stale
  if [ ! -d "$ROOT/frontend/dist" ] || [ "$2" = "--rebuild" ]; then
    echo "→ Building frontend…"
    cd "$ROOT/frontend"
    npm ci --no-audit --no-fund 2>/dev/null || npm install
    npm run build
  fi

  echo ""
  echo "  App → http://localhost:8000"
  echo ""

  cd "$ROOT"
  exec python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
fi

# ── Development mode (default) ────────────────────────────────────────────────
echo "╔══════════════════════════════════════════╗"
echo "║  Byte Wave — Development Mode            ║"
echo "╚══════════════════════════════════════════╝"

# Backend (FastAPI on :8000)
echo "→ Starting API on http://localhost:8000"
cd "$ROOT"
python -m uvicorn backend.main:app --reload --reload-dir backend --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# Frontend (Vite on :5173)
echo "→ Starting frontend on http://localhost:5173"
cd "$ROOT/frontend"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "  Backend  → http://localhost:8000"
echo "  Frontend → http://localhost:5173"
echo ""
echo "Press Ctrl-C to stop both servers."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM
wait $BACKEND_PID $FRONTEND_PID
