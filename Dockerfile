# ─────────────────────────────────────────────────────────────────────────────
# Byte Wave — multi-stage Docker build
# Stage 1: build the React frontend
# Stage 2: run the FastAPI backend (serves the built frontend in production)
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Frontend build ──────────────────────────────────────────────────
FROM node:20-slim AS frontend-build

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Python runtime ─────────────────────────────────────────────────
FROM python:3.12-slim

# System deps for Manim, Cairo, LaTeX, and general build tooling
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ffmpeg \
    libcairo2-dev \
    libpango1.0-dev \
    texlive-latex-base \
    texlive-fonts-recommended \
    texlive-latex-extra \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (Docker layer caching)
COPY backend/requirements.txt backend/requirements.txt
COPY backend/requirements-manim.txt backend/requirements-manim.txt
RUN pip install --no-cache-dir -r backend/requirements.txt \
    && pip install --no-cache-dir -r backend/requirements-manim.txt || true

# Copy the full backend
COPY backend/ backend/

# Copy the built frontend from Stage 1
COPY --from=frontend-build /app/frontend/dist frontend/dist

# Copy root-level files needed at runtime
COPY run.sh .env.example ./

# Create directories that the app expects
RUN mkdir -p media_output/media media_output/clips

EXPOSE 8000

# Default: production mode (single process serving both API + frontend)
CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
