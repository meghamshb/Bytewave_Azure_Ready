# Byte Wave

**AI-powered physics learning platform.** Ask any physics question — get a Manim animation, an interactive Matter.js simulation, adaptive JEE-caliber assessments, and a structured skill map.

## Project layout

```
├── frontend/              React + Vite app (main UI)
│   └── src/
│       ├── screens/       Page-level components (Home, Landing, Assess, …)
│       ├── components/    Shared UI components
│       │   ├── dashboard/ Dashboard sub-components
│       │   └── nav/       Navigation sub-components
│       ├── hooks/         Custom React hooks (auth, analytics, forum, …)
│       ├── data/          Static data (team profiles)
│       └── utils/         Utility functions
├── backend/               FastAPI server — LLM pipeline, Manim renderer, RAG
│   ├── main.py            API routes + production SPA serving
│   ├── agent.py           Claude AI agent (plan, code-gen, follow-up)
│   ├── learn.py           Adaptive learning engine, mastery scoring, questions
│   ├── manim_runner.py    Manim subprocess runner with sandboxing
│   └── rag/               ChromaDB knowledge base for physics accuracy
├── media_output/          Auto-generated Manim videos (created at runtime)
├── .env                   Environment variables (copy from .env.example)
├── run.sh                 One-command startup (dev or prod mode)
├── Dockerfile             Multi-stage container build
└── docker-compose.yml     Single-command deployment
```

---

## Quick start (development)

### 1. Environment

```bash
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
```

### 2. Backend dependencies

```bash
pip install -r backend/requirements.txt
```

For Manim video rendering (optional but recommended):

```bash
# macOS
brew install cairo pkg-config ffmpeg
pip install -r backend/requirements-manim.txt

# Linux (Ubuntu/Debian)
sudo apt install libcairo2-dev pkg-config ffmpeg texlive-latex-base
pip install -r backend/requirements-manim.txt
```

### 3. Frontend dependencies

```bash
cd frontend && npm install
```

### 4. Run (development)

```bash
./run.sh
```

- **Frontend** → http://localhost:5173
- **Backend API** → http://localhost:8000

---

## Production deployment

### Option A: Docker (recommended)

```bash
cp .env.example .env
# Edit .env with your ANTHROPIC_API_KEY

docker compose up --build -d
```

The app is served at **http://localhost:8000** — the FastAPI backend serves the built React frontend, no separate web server needed.

### Option B: Direct

```bash
./run.sh --prod
```

This builds the frontend and starts a single uvicorn process that serves both the API and the React SPA on port 8000.

### Option C: Custom

```bash
# Build frontend
cd frontend && npm ci && npm run build && cd ..

# Start backend (it auto-detects frontend/dist/ and serves it)
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Claude API key for AI features |
| `CORS_ORIGINS` | No | Comma-separated allowed origins (defaults to localhost) |
| `ADMIN_KEY` | No | Protects admin endpoints like `/api/admin/prerender-clips` |
| `VITE_POSTHOG_KEY` | No | PostHog analytics key (frontend) |

---

## Key features

| Feature | Stack |
|---|---|
| AI physics chat + Manim animations | Claude (Anthropic) → Manim |
| Interactive physics simulations | Matter.js |
| Adaptive assessments (MCQ, one-at-a-time) | Claude + adaptive mastery engine |
| Netflix-style recommendations | Mastery-weighted algorithm |
| Physics accuracy layer | RAG (ChromaDB + sentence-transformers) |
| Skill map + mastery tracking | React + recency-weighted scoring |
| Community forum | FastAPI in-memory store |
| Auth + onboarding | localStorage (Supabase-ready) |
| Analytics | PostHog |
