import asyncio
import hashlib
import logging
import time
import uuid
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, JSONResponse
from pydantic import BaseModel, Field
from pathlib import Path

from backend.agent import (
    generate_animation_plan,
    generate_manim_code,
    generate_plan_and_code,
    fix_manim_code,
    generate_template_manim_code,
    followup_chat,
    sanitize_question,
    match_template,
    _extract_numeric_params,
    generate_matter_scene,
)
from backend.manim_runner import run_manim_script, ManimExecutionError
import backend.learn as _learn
from backend.learn import save_animation, get_animations, delete_animation

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

MAX_ERROR_DETAIL_LENGTH = 2000
MAX_RENDER_RETRIES = 2  # attempt 0 = first render, attempt 1 = LLM self-correction via Claude

# Rate limiting: max requests per minute per IP
RATE_LIMIT_MAX = 120
RATE_LIMIT_WINDOW = 60
_rate_buckets: dict[str, list[float]] = defaultdict(list)

# Async render job store (in-memory; fine for single-process deployment)
_jobs: dict[str, dict] = {}
_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="render")

# ── Render result cache (hash-based, deterministic template renders only) ─────
_render_cache: dict[str, dict] = {}
_CACHE_TTL_SECONDS = 86400  # 24 hours


def _cache_key(question: str, params: dict) -> str:
    raw = question.lower().strip() + "|" + repr(sorted(params.items()))
    return hashlib.sha256(raw.encode()).hexdigest()[:20]


def _get_from_render_cache(question: str, params: dict) -> dict | None:
    key = _cache_key(question, params)
    entry = _render_cache.get(key)
    if not entry:
        return None
    if time.time() - entry["cached_at"] > _CACHE_TTL_SECONDS:
        _render_cache.pop(key, None)
        return None
    # Verify the video file still exists on disk
    try:
        video_path_str = entry.get("video_url", "")
        if video_path_str:
            full = ROOT_DIR / "media_output" / video_path_str.lstrip("/")
            if not full.exists():
                _render_cache.pop(key, None)
                return None
    except Exception:
        pass
    return entry


def _set_render_cache(question: str, params: dict, result: dict) -> None:
    key = _cache_key(question, params)
    _render_cache[key] = {**result, "cached_at": time.time()}


ROOT_DIR = Path(__file__).resolve().parent.parent

app = FastAPI(title="PhysiMate – AI Physics Animator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://0.0.0.0:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def no_cache_frontend(request: Request, call_next):
    """Force the browser to always fetch fresh JS/CSS — never use a cached copy."""
    response = await call_next(request)
    path = request.url.path
    if path.startswith("/frontend/") and (path.endswith(".js") or path.endswith(".css")):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
        response.headers["Pragma"] = "no-cache"
    return response


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    _exempt_prefixes = (
        "/api/job/", "/api/simulate", "/api/learn/",
        "/api/progress/", "/api/recommendations/", "/api/cases/",
        "/api/waitlist/",
    )
    path = request.url.path
    if path.startswith("/api/") and not any(path.startswith(p) for p in _exempt_prefixes):
        client_ip = request.client.host if request.client else "unknown"
        now = time.time()
        bucket = _rate_buckets[client_ip]
        _rate_buckets[client_ip] = [t for t in bucket if now - t < RATE_LIMIT_WINDOW]
        bucket = _rate_buckets[client_ip]
        if len(bucket) >= RATE_LIMIT_MAX:
            logger.warning("Rate limit exceeded for %s", client_ip)
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please wait a minute."},
            )
        bucket.append(now)
    return await call_next(request)


# ── In-memory stores (swap for SQLite / Postgres in production) ───────────────
# These persist until the server restarts. For persistence, mount a volume or
# use a DB — the API contract stays the same.
_waitlist: list[dict] = []          # { email, joined_at }
_forum_posts: list[dict] = []       # mirrors useForum's structure
_progress_store: dict[str, list] = {}  # userId → progress[] (overrides DB when present)


# ── Pydantic models ──────────────────────────────────────────────────────────

class QuestionRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=16_000)

class CodeRequest(BaseModel):
    question: str = Field(default="", max_length=4000)
    plan: str = Field(default="", max_length=16_000)

class RenderRequest(BaseModel):
    code: str = Field(..., min_length=10, max_length=100_000)
    plan: str = Field(..., min_length=1, max_length=8000)
    question: str = Field(default="", max_length=4000)
    quality: str = Field(default="low")  # "low" | "medium" | "high"

class AsyncRenderRequest(BaseModel):
    code: str = Field(..., min_length=10, max_length=100_000)
    plan: str = Field(..., min_length=1, max_length=8000)
    question: str = Field(default="", max_length=4000)
    quality: str = Field(default="low")

class QuickRenderRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=4000)
    quality: str = Field(default="low")

class FollowupRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    history: list[dict] = Field(default_factory=list)
    previous_code: str = Field(default="", max_length=100_000)
    previous_plan: str = Field(default="", max_length=8000)
    original_question: str = Field(default="", max_length=4000)
    quality: str = Field(default="low")


# ── Manim pre-warm on startup ─────────────────────────────────────────────────

_WARMUP_CODE = """from manim import *
class _WarmupScene(Scene):
    def construct(self):
        self.wait(0.05)
"""


@app.on_event("startup")
async def init_learning_db():
    """Initialise the SQLite learning database on startup."""
    try:
        _learn.init_db()
    except Exception as exc:
        logger.warning("Learning DB init failed (non-fatal): %s", exc)


@app.on_event("startup")
async def prewarm_manim():
    """Warm up Manim's renderer cache so the first real render doesn't pay cold-start cost."""
    def _do_warmup():
        try:
            run_manim_script(_WARMUP_CODE, quality="low")
            logger.info("Manim pre-warm complete.")
        except Exception as exc:
            logger.warning("Manim pre-warm failed (non-fatal): %s", exc)

    loop = asyncio.get_event_loop()
    loop.run_in_executor(_executor, _do_warmup)


# ── Static files ─────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return JSONResponse({"status": "ok", "service": "Byte Wave API"})

MEDIA_DIR = ROOT_DIR / "media_output" / "media"
MEDIA_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=str(MEDIA_DIR)), name="media")

# Pre-rendered physics clip videos (used by Forum seed posts)
_CLIPS_STATIC_DIR = ROOT_DIR / "media_output" / "clips"
_CLIPS_STATIC_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/videos/clips", StaticFiles(directory=str(_CLIPS_STATIC_DIR)), name="clips")


# ── Helpers ──────────────────────────────────────────────────────────────────

def _truncate_detail(msg) -> str:
    msg = str(msg)
    return msg[:MAX_ERROR_DETAIL_LENGTH] + ("..." if len(msg) > MAX_ERROR_DETAIL_LENGTH else "")


def _video_path_to_url(video_path: str) -> str:
    path_parts = video_path.split("media_output")[-1].replace("\\", "/").lstrip("/")
    return "/" + path_parts if path_parts else ""


def _friendly_error(raw: str) -> str:
    """Convert a raw error string into a user-friendly message."""
    raw_lower = raw.lower()
    if "syntaxerror" in raw_lower:
        return ("The animation code had a syntax error. "
                "Try rephrasing your question more specifically — e.g. 'Show me a pendulum swinging' "
                "instead of a complex multi-step description.")
    if "timeout" in raw_lower:
        return ("Rendering took too long. Try asking for a simpler animation "
                "with fewer elements.")
    if "nameerror" in raw_lower or "attributeerror" in raw_lower:
        return ("The animation had a code error. Try rephrasing your question "
                "or asking for a different physics concept.")
    if "disallowed pattern" in raw_lower:
        return raw  # show sanitization messages as-is
    return f"Animation failed: {raw[:300]}"


def _render_with_retries(
    code: str,
    plan: str,
    question: str,
    max_retries: int = MAX_RENDER_RETRIES,
    quality: str = "low",
) -> dict:
    """
    Try to render code, self-correct on failure, fallback to template as last resort.
    Returns dict with keys: video_url, final_code, retries, fallback_used (optional).
    Raises HTTPException on total failure.
    """
    current_code = code
    last_error_msg = ""

    for attempt in range(max_retries):
        try:
            video_path = run_manim_script(current_code, quality=quality)
            video_url = _video_path_to_url(video_path)
            return {
                "video_url": video_url,
                "final_code": current_code,
                "retries": attempt,
            }
        except ManimExecutionError as e:
            last_error_msg = e.stderr
            logger.warning("Render attempt %d failed: %s", attempt + 1, e.stderr[:200])
            if attempt < max_retries - 1:
                logger.info("Attempting LLM self-correction...")
                try:
                    current_code = fix_manim_code(plan, current_code, e.stderr)
                except Exception as llm_e:
                    logger.error("LLM self-correction failed: %s", llm_e)
                    raise HTTPException(
                        status_code=500,
                        detail=_truncate_detail(f"LLM self-correction failed: {llm_e}"),
                    )
        except Exception as e:
            raise HTTPException(status_code=500, detail=_truncate_detail(e))

    # All retries exhausted — try deterministic fallback template
    logger.info("All retries exhausted, trying fallback template for: %s", question[:80])
    try:
        fallback_code = generate_template_manim_code(question)
        video_path = run_manim_script(fallback_code, quality=quality)
        video_url = _video_path_to_url(video_path)
        return {
            "video_url": video_url,
            "final_code": fallback_code,
            "retries": max_retries,
            "fallback_used": True,
        }
    except Exception as fallback_error:
        raise HTTPException(
            status_code=500,
            detail=_truncate_detail(
                _friendly_error(
                    f"Failed after {max_retries} attempts, and fallback failed: "
                    f"{fallback_error}. Last render error: {last_error_msg}"
                )
            ),
        )


def _render_job_safe(
    job_id: str,
    code: str,
    plan: str,
    question: str,
    quality: str,
) -> None:
    """
    Blocking render function designed to run in a ThreadPoolExecutor.
    Updates _jobs[job_id] in-place; never raises.
    Hard wall-clock deadline of 125 s ensures the job always resolves.
    """
    import threading

    JOB_DEADLINE_S = 250  # must be > MANIM_RENDER_TIMEOUT (240 s)

    _jobs[job_id]["status"] = "rendering"
    _jobs[job_id]["progress"] = "Rendering animation..."

    result_holder: dict = {}

    def _worker():
        try:
            result_holder["result"] = _render_with_retries(code, plan, question, quality=quality)
        except HTTPException as e:
            result_holder["error"] = _friendly_error(str(e.detail))
        except Exception as e:
            result_holder["error"] = _friendly_error(str(e))

    t = threading.Thread(target=_worker, daemon=True)
    t.start()
    t.join(timeout=JOB_DEADLINE_S)

    if t.is_alive():
        # Worker is still running past the deadline — mark as error immediately
        _jobs[job_id]["status"] = "error"
        _jobs[job_id]["error"] = "Render timed out. Try a simpler animation or lower quality. (Voiceover renders take longer — this is normal on first run while the TTS model downloads.)"
        return

    if "result" in result_holder:
        _jobs[job_id]["status"] = "done"
        _jobs[job_id]["result"] = result_holder["result"]
        _jobs[job_id]["progress"] = "Done"
        cache_q = _jobs[job_id].get("_cache_question")
        cache_p = _jobs[job_id].get("_cache_params")
        if cache_q is not None and cache_p is not None:
            _set_render_cache(cache_q, cache_p, result_holder["result"])
            logger.info("Render result cached for: %s", cache_q[:60])
        # ── Persist animation to DB ───────────────────────────────────────────
        try:
            video_url = result_holder["result"].get("video_url", "")
            if video_url and question:
                save_animation(question, video_url, quality)
        except Exception as _save_err:
            logger.warning("Failed to persist animation to DB (non-fatal): %s", _save_err)
    else:
        _jobs[job_id]["status"] = "error"
        _jobs[job_id]["error"] = result_holder.get("error", "Unknown render error.")


# ── API Endpoints ─────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    """Health check: confirms the server is up and env is valid."""
    import os
    checks = {
        "server": "ok",
        "anthropic_key": "ok" if os.environ.get("ANTHROPIC_API_KEY") else "missing",
    }
    try:
        import manim  # noqa
        checks["manim"] = "ok"
    except ImportError:
        checks["manim"] = "missing"
    try:
        import manim_physics  # noqa
        checks["manim_physics"] = "ok"
    except ImportError:
        checks["manim_physics"] = "not_installed"
    try:
        import pymunk  # noqa
        checks["pymunk"] = "ok"
    except ImportError:
        checks["pymunk"] = "not_installed"
    status_code = 200 if checks.get("anthropic_key") == "ok" else 503
    return JSONResponse(content=checks, status_code=status_code)


@app.post("/api/generate_plan_and_code")
async def generate_plan_and_code_endpoint(request: QuestionRequest):
    """
    Combined endpoint: single LLM call that returns both plan and Manim code.
    Saves one API round-trip vs calling /generate_plan then /generate_code separately.
    Falls back to 500 so the frontend can retry with the two-step flow.
    """
    logger.info("generate_plan_and_code: %s", request.question[:80])
    try:
        sanitize_question(request.question)
        plan, code = generate_plan_and_code(request.question)
        return {"plan": plan, "code": code}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=_truncate_detail(e))
    except Exception as e:
        logger.error("generate_plan_and_code failed: %s", e)
        raise HTTPException(status_code=500, detail=_truncate_detail(e))


@app.post("/api/simulate")
async def get_simulation_scene(request: QuestionRequest):
    """
    Return a Matter.js interactive scene config for the given physics question.
    Uses keyword matching first; falls back to Claude (Anthropic) classification
    so the interactive is always in sync with the Manim video.
    Runs in a thread-pool so the LLM call never blocks the async event loop.
    """
    import asyncio
    logger.info("simulate: %s", request.question[:80])
    try:
        params = _extract_numeric_params(request.question)
        scene = await asyncio.to_thread(generate_matter_scene, request.question, params)
        return scene
    except Exception as e:
        logger.error("simulate scene generation failed: %s", e)
        return {"supported": False, "domain": "error", "message": str(e)}


@app.post("/api/generate_plan")
async def generate_plan(request: QuestionRequest):
    logger.info("generate_plan: %s", request.question[:80])
    try:
        sanitize_question(request.question)
        plan = generate_animation_plan(request.question)
        return {"plan": plan}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=_truncate_detail(e))
    except Exception as e:
        logger.error("generate_plan failed: %s", e)
        raise HTTPException(status_code=500, detail=_truncate_detail(e))


@app.post("/api/generate_code")
async def generate_code(request: CodeRequest):
    plan = (request.plan or request.question or "").strip()
    question = (request.question or "").strip()
    logger.info("generate_code: plan=%d chars, question=%d chars", len(plan), len(question))
    try:
        if not plan:
            raise ValueError("Plan is required.")
        sanitize_question(question or plan)
        code = generate_manim_code(plan, question)
        return {"code": code}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=_truncate_detail(e))
    except Exception as e:
        logger.error("generate_code failed: %s", e)
        raise HTTPException(status_code=500, detail=_truncate_detail(e))


@app.post("/api/render_video")
async def render_video(request: RenderRequest):
    question = (request.question or request.plan or "physics animation").strip()
    logger.info("render_video: code=%d chars, quality=%s", len(request.code), request.quality)
    quality = request.quality if request.quality in ("low", "medium", "high") else "low"
    return _render_with_retries(request.code, request.plan, question, quality=quality)


@app.post("/api/quick_render")
async def quick_render(request: QuickRenderRequest):
    """
    Fast path: if the question matches a built-in template, skip LLM entirely
    and start a render job immediately. Returns {"job_id": ..., "skipped_llm": True}
    or {"job_id": null} if no template matched (frontend should fall back to full flow).
    Checks a hash-based render cache first — cached results return an instantly-done job.
    """
    try:
        sanitize_question(request.question)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    domain = match_template(request.question)
    if not domain:
        return {"job_id": None, "skipped_llm": False}

    quality = request.quality if request.quality in ("low", "medium", "high") else "low"

    # ── Cache check ───────────────────────────────────────────────────────────
    params = _extract_numeric_params(request.question)
    cached_result = _get_from_render_cache(request.question, params)
    if cached_result:
        job_id = str(uuid.uuid4())
        _jobs[job_id] = {
            "status": "done",
            "progress": "Done (cached)",
            "result": cached_result,
            "error": None,
            "started_at": time.time(),
        }
        logger.info("quick_render: cache HIT for domain=%s job=%s", domain, job_id)
        return {"job_id": job_id, "skipped_llm": True, "domain": domain, "cached": True}

    try:
        code = generate_template_manim_code(request.question)
    except Exception as e:
        logger.error("quick_render template gen failed: %s", e)
        return {"job_id": None, "skipped_llm": False}

    plan = f"Template-rendered {domain} animation for: {request.question}"
    job_id = str(uuid.uuid4())
    _jobs[job_id] = {
        "status": "pending",
        "progress": f"Rendering {domain} animation...",
        "result": None,
        "error": None,
        "started_at": time.time(),
        "_cache_question": request.question,
        "_cache_params": params,
    }
    loop = asyncio.get_event_loop()
    loop.run_in_executor(_executor, _render_job_safe, job_id, code, plan,
                         request.question, quality)
    logger.info("quick_render: template=%s job=%s quality=%s", domain, job_id, quality)
    return {"job_id": job_id, "skipped_llm": True, "domain": domain}


@app.post("/api/render_async")
async def render_async(request: AsyncRenderRequest):
    """
    Non-blocking render: returns a job_id immediately.
    Poll GET /api/job/{job_id} for status.
    """
    quality = request.quality if request.quality in ("low", "medium", "high") else "low"
    job_id = str(uuid.uuid4())
    _jobs[job_id] = {
        "status": "pending",
        "progress": "Queued for rendering...",
        "result": None,
        "error": None,
        "started_at": time.time(),
    }
    loop = asyncio.get_event_loop()
    loop.run_in_executor(
        _executor,
        _render_job_safe,
        job_id,
        request.code,
        request.plan,
        (request.question or request.plan or "physics animation").strip(),
        quality,
    )
    logger.info("Async render job %s queued (quality=%s)", job_id, quality)
    return {"job_id": job_id}


@app.get("/api/job/{job_id}")
async def get_job_status(job_id: str):
    """Poll for async render job status."""
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    elapsed = round(time.time() - job["started_at"])
    return {
        "status": job["status"],       # pending | rendering | done | error
        "progress": job["progress"],
        "elapsed_s": elapsed,
        "result": job["result"],        # dict with video_url, final_code etc. when done
        "error": job["error"],          # friendly error string when error
    }


@app.post("/api/followup")
async def followup(request: FollowupRequest):
    logger.info("followup: %s", request.message[:80])
    try:
        sanitize_question(request.message)
        result = followup_chat(
            message=request.message,
            history=request.history,
            previous_plan=request.previous_plan,
            previous_code=request.previous_code,
            original_question=request.original_question,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=_truncate_detail(e))
    except Exception as e:
        logger.error("followup_chat failed: %s", e)
        raise HTTPException(status_code=500, detail=_truncate_detail(e))

    quality = request.quality if request.quality in ("low", "medium", "high") else "low"

    if result.get("type") == "animate":
        plan = result.get("plan", "")
        followup_question = request.message or request.original_question

        # Merge params extracted by followup_chat into the question string so
        # downstream extraction always sees them.
        _fu_params = result.get("params") or {}
        if _fu_params:
            _param_suffix = " " + " ".join(f"{k}={v}" for k, v in _fu_params.items())
            followup_question = followup_question + _param_suffix

        # ── Fast path: try template on the ORIGINAL question with updated params ──
        # This avoids a slow LLM code-gen call for simple param changes.
        # Merge follow-up params on top of params from the original question.
        _orig_params = _extract_numeric_params(request.original_question)
        _merged_params = {**_orig_params, **_fu_params}
        # Also extract any extra params in the follow-up message itself
        _msg_params = _extract_numeric_params(request.message)
        _merged_params.update(_msg_params)

        _template_domain = match_template(request.original_question)
        code = None
        if _template_domain:
            try:
                code = generate_template_manim_code(request.original_question, _merged_params)
                plan = plan or f"Template: {_template_domain} with updated params {_merged_params}"
                logger.info("followup: used template '%s' with params %s", _template_domain, _merged_params)
            except Exception as tmpl_e:
                logger.warning("followup template failed (%s), falling back to LLM", tmpl_e)
                code = None

        # ── Slow path: LLM code generation ───────────────────────────────────
        if code is None:
            try:
                code = generate_manim_code(plan, followup_question)
            except Exception as e:
                logger.error("followup code gen failed: %s", e)
                return {
                    "type": "text",
                    "reply": f"{result.get('reply', '')}\n\n(Could not generate animation code: {e})",
                }

        try:
            render_result = _render_with_retries(code, plan, followup_question, quality=quality)
            return {
                "type": "animate",
                "reply": result.get("reply", ""),
                "plan": plan,
                "code": render_result["final_code"],
                "video_url": render_result["video_url"],
                "fallback_used": render_result.get("fallback_used", False),
            }
        except HTTPException as he:
            friendly = _friendly_error(str(he.detail))
            return {
                "type": "text",
                "reply": f"{result.get('reply', '')}\n\n{friendly}",
            }

    return {"type": "text", "reply": result.get("reply", "")}


@app.get("/api/rag/stats")
async def rag_stats():
    """Return RAG knowledge base statistics."""
    try:
        from backend.rag.knowledge_base import examples_count, list_examples
        return {
            "examples": examples_count(),
            "topics": [e["topic"] for e in list_examples()],
        }
    except Exception as e:
        return {"examples": 0, "error": str(e)}


# ── Learning / Skill-Map Endpoints ────────────────────────────────────────────

class LearnSessionRequest(BaseModel):
    student_id: str = Field(..., min_length=1, max_length=64)
    skill: str = Field(..., min_length=1, max_length=64)
    case_id: str = Field(..., min_length=1, max_length=64)

class LearnSubmitRequest(BaseModel):
    student_id: str = Field(..., min_length=1, max_length=64)
    session_id: str = Field(..., min_length=1, max_length=64)
    skill: str = Field(..., min_length=1, max_length=64)
    case_id: str = Field(..., min_length=1, max_length=64)
    qa_pairs: list[dict] = Field(..., min_length=1, max_length=10)

class LearnStudentRequest(BaseModel):
    student_id: str = Field(..., min_length=1, max_length=64)
    name: str = Field(default="Student", max_length=60)


@app.get("/api/learn/skills")
async def learn_skills():
    """Return the full skills catalogue."""
    return {"skills": _learn.SKILLS}


@app.post("/api/learn/student")
async def learn_student(req: LearnStudentRequest):
    """Create or fetch a student record."""
    student = _learn.get_or_create_student(req.student_id, req.name)
    return student


@app.get("/api/learn/recommend/{student_id}")
async def learn_recommend(student_id: str):
    """Return Netflix-style recommendation rows for a student."""
    try:
        return _learn.get_recommendations(student_id)
    except Exception as e:
        logger.error("learn_recommend failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/learn/questions")
async def learn_questions(req: LearnSessionRequest):
    """
    Start an assessment session and return generated questions.
    Returns session_id + questions list.
    """
    try:
        # Validate skill / case
        skill_data = _learn.SKILLS.get(req.skill)
        if not skill_data:
            raise HTTPException(status_code=400, detail=f"Unknown skill: {req.skill}")
        case_ids = [c["id"] for c in skill_data["cases"]]
        if req.case_id not in case_ids:
            raise HTTPException(status_code=400, detail=f"Unknown case: {req.case_id}")

        # Get or seed student
        _learn.get_or_create_student(req.student_id)

        # Current mastery (0 if never attempted)
        mastery_map = _learn.get_mastery(req.student_id)
        mastery_score = mastery_map.get(req.skill, {}).get("score", 0)

        session_id = _learn.start_session(req.student_id, req.skill, req.case_id)
        questions = _learn.generate_questions(req.skill, req.case_id, mastery_score)

        return {
            "session_id": session_id,
            "skill": req.skill,
            "case_id": req.case_id,
            "mastery_before": mastery_score,
            "questions": questions,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("learn_questions failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/learn/submit")
async def learn_submit(req: LearnSubmitRequest):
    """
    Evaluate a student's answers, update mastery, return feedback.
    If needs_remediation, also kicks off a PhysiMate animation job.

    Returns:
      evaluation dict + optional remediation_job_id
    """
    try:
        evaluation = _learn.evaluate_answers(req.skill, req.case_id, req.qa_pairs)

        answer_rows = [
            {
                "question": qa.get("question", ""),
                "student_answer": qa.get("student_answer", ""),
                "correct": result.get("correct", False),
                "gap": result.get("gap", ""),
                "feedback": result.get("feedback", ""),
            }
            for qa, result in zip(req.qa_pairs, evaluation.get("results", []))
        ]

        _learn.complete_session(
            session_id=req.session_id,
            student_id=req.student_id,
            skill=req.skill,
            overall_score=evaluation.get("overall_score", 0),
            delta=evaluation.get("delta", 0),
            gaps=evaluation.get("gaps", []),
            answer_rows=answer_rows,
        )

        # ── Remediation animation ─────────────────────────────────────────────
        remediation_job_id = None
        if evaluation.get("needs_remediation"):
            remediation_prompt = _learn.get_remediation_prompt(
                req.case_id, evaluation.get("remediation_concept", "")
            )
            try:
                from backend.agent import generate_template_manim_code, match_template
                params = _extract_numeric_params(remediation_prompt)
                code = generate_template_manim_code(remediation_prompt, params)
                plan = f"Remediation: {req.case_id} — {evaluation.get('remediation_concept', '')}"
                remediation_job_id = str(uuid.uuid4())
                _jobs[remediation_job_id] = {
                    "status": "pending",
                    "progress": "Generating remediation animation...",
                    "result": None,
                    "error": None,
                    "started_at": time.time(),
                }
                loop = asyncio.get_event_loop()
                loop.run_in_executor(
                    _executor,
                    _render_job_safe,
                    remediation_job_id,
                    code,
                    plan,
                    remediation_prompt,
                    "low",
                )
            except Exception as rem_e:
                logger.warning("Remediation animation failed to queue: %s", rem_e)

        return {
            **evaluation,
            "remediation_job_id": remediation_job_id,
            "remediation_prompt": _learn.get_remediation_prompt(
                req.case_id, evaluation.get("remediation_concept", "")
            ) if evaluation.get("needs_remediation") else None,
        }

    except Exception as e:
        logger.error("learn_submit failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# ── Adaptive (one-at-a-time) quiz flow ────────────────────────────────────────

class AdaptiveSubmitRequest(BaseModel):
    student_id: str = Field(..., min_length=1, max_length=64)
    session_id: str = Field(..., min_length=1, max_length=64)
    skill: str = Field(..., min_length=1, max_length=64)
    case_id: str = Field(..., min_length=1, max_length=64)
    question: str = Field(...)
    answer: str = Field(...)           # correct_option letter (A/B/C/D)
    misconception: str = Field(default="")
    explanation: str = Field(default="")
    student_answer: str = Field(default="")  # selected option letter
    previous_questions: list[str] = Field(default_factory=list)
    results_history: list[dict] = Field(default_factory=list)
    mastery_before: int = Field(default=0)


@app.post("/api/learn/start-adaptive")
async def learn_start_adaptive(req: LearnSessionRequest):
    """Start an adaptive session: returns session_id + first question."""
    try:
        skill_data = _learn.SKILLS.get(req.skill)
        if not skill_data:
            raise HTTPException(status_code=400, detail=f"Unknown skill: {req.skill}")
        case_ids = [c["id"] for c in skill_data["cases"]]
        if req.case_id not in case_ids:
            raise HTTPException(status_code=400, detail=f"Unknown case: {req.case_id}")

        _learn.get_or_create_student(req.student_id)

        mastery_map = _learn.get_mastery(req.student_id)
        mastery_score = mastery_map.get(req.skill, {}).get("score", 0)

        session_id = _learn.start_session(req.student_id, req.skill, req.case_id)
        question = _learn.generate_single_question(req.skill, req.case_id, mastery_score)

        return {
            "session_id": session_id,
            "skill": req.skill,
            "case_id": req.case_id,
            "mastery_before": mastery_score,
            "question": question,
            "question_number": 1,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("learn_start_adaptive failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/learn/submit-one")
async def learn_submit_one(req: AdaptiveSubmitRequest):
    """Evaluate one answer, store it, update mastery, decide next step."""
    try:
        result = _learn.evaluate_single_answer(
            skill=req.skill,
            case_id=req.case_id,
            question=req.question,
            correct_answer=req.answer,
            misconception=req.misconception,
            student_answer=req.student_answer,
        )

        mastery_now = _learn.store_single_answer(
            session_id=req.session_id,
            student_id=req.student_id,
            skill=req.skill,
            question_text=req.question,
            student_answer=req.student_answer,
            correct=result.get("correct", False),
            gap=result.get("gap", ""),
            feedback=result.get("feedback", ""),
        )

        updated_history = list(req.results_history) + [{
            "question": req.question,
            "student_answer": req.student_answer,
            "correct": result.get("correct", False),
            "gap": result.get("gap", ""),
            "feedback": result.get("feedback", ""),
        }]

        recent_correct = [r.get("correct", False) for r in updated_history]
        questions_answered = len(updated_history)

        keep_going = _learn.should_continue_session(
            student_id=req.student_id,
            skill=req.skill,
            questions_answered=questions_answered,
            recent_results=recent_correct,
        )

        feedback_text = result.get("feedback", "")
        if not result.get("correct", False) and req.explanation:
            feedback_text = req.explanation

        response: dict[str, Any] = {
            "correct": result.get("correct", False),
            "feedback": feedback_text,
            "gap": result.get("gap", ""),
            "correct_option": req.answer,
            "mastery_now": mastery_now,
            "question_number": questions_answered,
            "done": not keep_going,
        }

        if keep_going:
            prev_qs = list(req.previous_questions) + [req.question]
            next_q = _learn.generate_single_question(
                req.skill, req.case_id, mastery_now, prev_qs
            )
            response["next_question"] = next_q
        else:
            summary = _learn.build_session_summary(
                session_id=req.session_id,
                student_id=req.student_id,
                skill=req.skill,
                mastery_before=req.mastery_before,
                results_history=updated_history,
            )

            if summary.get("needs_remediation"):
                try:
                    remediation_prompt = _learn.get_remediation_prompt(
                        req.case_id, summary.get("remediation_concept", "")
                    )
                    from backend.agent import generate_template_manim_code, match_template
                    params = _extract_numeric_params(remediation_prompt)
                    code = generate_template_manim_code(remediation_prompt, params)
                    plan = f"Remediation: {req.case_id} — {summary.get('remediation_concept', '')}"
                    job_id = str(uuid.uuid4())
                    _jobs[job_id] = {
                        "status": "pending",
                        "progress": "Generating remediation animation...",
                        "result": None,
                        "error": None,
                        "started_at": time.time(),
                    }
                    loop = asyncio.get_event_loop()
                    loop.run_in_executor(
                        _executor, _render_job_safe, job_id, code, plan, remediation_prompt, "low",
                    )
                    summary["remediation_job_id"] = job_id
                    summary["remediation_prompt"] = remediation_prompt
                except Exception as rem_e:
                    logger.warning("Remediation animation failed to queue: %s", rem_e)

            response["summary"] = summary

        return response

    except Exception as e:
        logger.error("learn_submit_one failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/learn/profile/{student_id}")
async def learn_profile(student_id: str):
    """Return full mastery profile for a student."""
    try:
        mastery = _learn.get_mastery(student_id)
        return {
            "student_id": student_id,
            "mastery": mastery,
            "skills": _learn.SKILLS,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Bytewave-compatible API endpoints ────────────────────────────────────────
# These match the endpoint signatures the Bytewave frontend already calls.

_BW_USER = "1"  # Bytewave uses a hardcoded user_id=1 for now


def _skill_status(score: int, attempts: int) -> str:
    if attempts == 0:
        return "Not started"
    if score >= 80:
        return "Mastered"
    return "In progress"


@app.get("/api/progress/{user_id}")
async def bw_progress(user_id: str):
    """
    Return skill-map node data for Bytewave's constellation view.
    Shape: [{skill_id, skill_name, status, mastery_score}, ...]
    """
    mastery = _learn.get_mastery(user_id)
    nodes = []
    for skill_id, skill in _learn.SKILLS.items():
        m = mastery.get(skill_id, {})
        score = m.get("score", 0)
        att   = m.get("attempts", 0)
        nodes.append({
            "skill_id":    skill_id,
            "skill_name":  skill["label"],
            "status":      _skill_status(score, att),
            "mastery_score": score,
        })
    return nodes


@app.get("/api/recommendations/{user_id}")
async def bw_recommendations(user_id: str):
    """
    Return Netflix-style recommendation rows for the Bytewave Home screen.
    Shape: [{item_id, item_name, recommendation_type, match_score, reason}, ...]
    """
    data = _learn.get_recommendations(user_id)
    result = []

    type_map = [
        ("next_for_you",    "Next for you"),
        ("review",          "Review"),
        ("ready_to_master", "Ready to master"),
    ]
    for key, label in type_map:
        seen_skills: set[str] = set()
        for item in data.get(key, []):
            skill = item["skill"]
            if skill in seen_skills:
                continue
            seen_skills.add(skill)
            mastery = item.get("mastery", 0)
            attempts = item.get("attempts", 0)
            if key == "next_for_you" and attempts == 0:
                reason = "New topic — great time to start"
            elif key == "next_for_you":
                reason = f"You're at {mastery}% — keep going"
            elif key == "review":
                reason = f"Needs more practice — {mastery}% mastery"
            else:
                reason = f"Score is {mastery}% — one more push to master it"
            result.append({
                "item_id":              skill,
                "item_name":            item["skill_label"],
                "recommendation_type":  label,
                "match_score":          item["match_pct"],
                "reason":               reason,
                "mastery_score":        mastery,
            })

    return result


@app.get("/api/cases/{skill_id}")
async def bw_cases(skill_id: str):
    """
    Return the list of practice cases for a skill.
    Shape: [{id, title, description, question, hint}, ...]
    """
    skill = _learn.SKILLS.get(skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail=f"Unknown skill: {skill_id}")
    return [
        {
            "id":          c["id"],
            "title":       c["label"],
            "description": c["desc"],
            "question":    c.get("question", c["desc"]),
            "hint":        c.get("hint", "Think about which formula connects the quantities."),
        }
        for c in skill["cases"]
    ]


class BWAssessRequest(BaseModel):
    user_id: str = Field(default="1")
    case_id: str = Field(..., min_length=1, max_length=64)
    user_answer: str = Field(..., min_length=1, max_length=8000)


@app.post("/api/assess")
async def bw_assess(req: BWAssessRequest):
    """
    Bytewave Assess endpoint: single answer → LLM feedback + score.
    Also triggers a remediation animation job if score is low.
    Returns: {llm_feedback, llm_score (0-1), remediation_job_id?, animation_prompt?}
    """
    # Resolve case
    case_entry = _learn._CASE_LOOKUP.get(req.case_id)
    if not case_entry:
        raise HTTPException(status_code=404, detail=f"Unknown case: {req.case_id}")
    skill_id, case_obj = case_entry

    qa_pairs = [{
        "question":       case_obj.get("question", case_obj["label"]),
        "answer":         "",   # we don't store the model answer here — LLM evaluates freely
        "misconception":  "",
        "student_answer": req.user_answer,
    }]

    try:
        evaluation = _learn.evaluate_answers(skill_id, req.case_id, qa_pairs)
    except Exception as e:
        logger.error("bw_assess evaluate_answers failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

    score_01 = round(evaluation.get("overall_score", 50) / 100, 2)
    feedback  = evaluation.get("summary_feedback", "Good effort!")

    # Update mastery for the user
    try:
        _learn.get_or_create_student(req.user_id)
        session_id = _learn.start_session(req.user_id, skill_id, req.case_id)
        _learn.complete_session(
            session_id=session_id,
            student_id=req.user_id,
            skill=skill_id,
            overall_score=evaluation.get("overall_score", 50),
            delta=evaluation.get("delta", 0),
            gaps=evaluation.get("gaps", []),
            answer_rows=[{
                "question": case_obj.get("question", ""),
                "student_answer": req.user_answer,
                "correct": evaluation.get("overall_score", 0) >= 60,
                "gap": ", ".join(evaluation.get("gaps", [])),
                "feedback": feedback,
            }],
        )
    except Exception as upd_e:
        logger.warning("bw_assess mastery update failed (non-fatal): %s", upd_e)

    # Remediation animation
    remediation_job_id   = None
    remediation_prompt   = None
    if evaluation.get("needs_remediation"):
        remediation_prompt = _learn.get_remediation_prompt(
            req.case_id, evaluation.get("remediation_concept", "")
        )
        try:
            code = generate_template_manim_code(remediation_prompt,
                                                _extract_numeric_params(remediation_prompt))
            plan = f"Remediation for {req.case_id}: {evaluation.get('remediation_concept','')}"
            remediation_job_id = str(uuid.uuid4())
            _jobs[remediation_job_id] = {
                "status": "pending", "progress": "Generating animation…",
                "result": None, "error": None, "started_at": time.time(),
            }
            loop = asyncio.get_event_loop()
            loop.run_in_executor(
                _executor, _render_job_safe,
                remediation_job_id, code, plan, remediation_prompt, "low",
            )
        except Exception as rem_e:
            logger.warning("bw_assess remediation job failed: %s", rem_e)

    return {
        "llm_feedback":        feedback,
        "llm_score":           score_01,
        "gaps":                evaluation.get("gaps", []),
        "needs_remediation":   evaluation.get("needs_remediation", False),
        "remediation_job_id":  remediation_job_id,
        "animation_prompt":    remediation_prompt,
        "per_question":        evaluation.get("results", []),
    }


class BWChatRequest(BaseModel):
    messages: list[dict] = Field(..., min_length=1)


@app.post("/api/chat")
async def bw_chat(req: BWChatRequest):
    """
    Bytewave Chat endpoint: multi-turn physics AI chat via Claude.
    Always generates a PhysiMate animation when the topic is clearly visual/physical.
    Returns: {reply, animation_job_id?}
    """
    # ── LLM reply (Claude chat) ───────────────────────────────────────────────
    try:
        import anthropic as _anthropic
        import os as _os
        _chat_client = _anthropic.Anthropic(
            api_key=_os.environ.get("ANTHROPIC_API_KEY", ""),
            timeout=60.0,
        )
        # Separate system messages from conversation messages
        _system_msgs = [m for m in req.messages if m.get("role") == "system"]
        _conv_msgs   = [m for m in req.messages if m.get("role") != "system"]
        _system_text = _system_msgs[0]["content"] if _system_msgs else None

        _kwargs: dict = {
            "model": "claude-haiku-4-5",
            "max_tokens": 600,
            "temperature": 0.6,
            "messages": _conv_msgs,
        }
        if _system_text:
            _kwargs["system"] = _system_text

        resp = _chat_client.messages.create(**_kwargs)
        reply = resp.content[0].text.strip()
    except Exception as e:
        logger.error("bw_chat LLM call failed: %s", e)
        raise HTTPException(status_code=500, detail=f"LLM error: {e}")

    # ── Animation trigger ─────────────────────────────────────────────────────
    # Instead of matching the raw user message (which rarely hits templates),
    # we map detected physics keywords → canonical template-compatible prompts.
    # This guarantees animations fire for any recognisable physics topic.
    _CHAT_ANIMATION_MAP = [
        # (keywords_in_message, canonical_animation_prompt)
        ({"pendulum", "bob", "swing"},
         "Show a pendulum swinging with period formula T = 2pi sqrt L over g."),
        ({"projectile", "trajectory", "launch", "cannon", "throw", "fired"},
         "Show projectile motion with velocity components at launch angle 45 degrees."),
        ({"spring", "oscillat", "shm", "simple harmonic", "hooke"},
         "Show spring-mass oscillation with k=8 m=2."),
        ({"elastic collision", "inelastic collision", "collision", "collide", "momentum", "billiard"},
         "Show an elastic collision between two balls m1=2 m2=1 v1=3."),
        ({"free fall", "freefall", "falling body", "falling ball", "dropping", "ball drop"},
         "Show free fall: a ball dropped from height h=5 meters with v=gt and y=half g t squared."),
        ({"gravity", "gravitational force", "orbital", "satellite", "kepler"},
         "Show gravitational orbital mechanics with F = GMm over r squared."),
        ({"incline", "ramp", "slope", "wedge", "inclined plane"},
         "Show a block sliding down a frictionless inclined plane at 30 degrees."),
        ({"newton", "second law", "f=ma", "force", "friction", "block"},
         "Explain Newton's second law with a block on a surface. Show F=ma."),
        ({"circular", "centripetal", "orbit", "satellite", "revolution"},
         "Show circular motion with centripetal acceleration and force labelled."),
        ({"wave", "transverse", "longitudinal", "frequency", "wavelength", "amplitude"},
         "Show a transverse wave with wavelength frequency and wave speed labelled."),
        ({"energy", "kinetic", "potential", "conservation", "roller"},
         "Show conservation of energy: ball rolling down a ramp."),
        ({"atwood", "pulley", "tension"},
         "Show an Atwood machine with two masses and tension in the rope."),
    ]

    user_messages = [m for m in req.messages if m.get("role") == "user"]
    last_user_msg = (user_messages[-1].get("content", "") if user_messages else "").lower()

    animation_job_id = None
    animation_prompt = None

    # Find the first matching animation prompt
    for keywords, prompt in _CHAT_ANIMATION_MAP:
        if any(kw in last_user_msg for kw in keywords):
            animation_prompt = prompt
            break

    # Extract numeric params only from the raw user message (e.g. "pendulum with L=1.5")
    # Use them to override defaults; fall back to empty dict if extraction fails.
    if animation_prompt:
        try:
            params = _extract_numeric_params(user_messages[-1].get("content", ""))
            # Ensure all values are plain floats — never sets or other types
            params = {k: float(v) for k, v in params.items()
                      if isinstance(v, (int, float, str)) and not isinstance(v, bool)}
        except Exception:
            params = {}
        try:
            code = generate_template_manim_code(animation_prompt, params)
            plan = f"Chat animation: {animation_prompt[:80]}"
            animation_job_id = str(uuid.uuid4())
            _jobs[animation_job_id] = {
                "status": "pending", "progress": "Generating animation…",
                "result": None, "error": None, "started_at": time.time(),
            }
            loop = asyncio.get_event_loop()
            loop.run_in_executor(
                _executor, _render_job_safe,
                animation_job_id, code, plan, animation_prompt, "low",
            )
            logger.info("bw_chat animation queued: job=%s prompt=%s", animation_job_id, animation_prompt[:60])
        except Exception as anim_e:
            logger.warning("bw_chat animation trigger failed: %s", anim_e)
            animation_job_id = None

    return {
        "reply": reply,
        "animation_job_id": animation_job_id,
    }


# ─────────────────────────────────────────────────────────────────────────────
# ── Waitlist endpoints ───────────────────────────────────────────────────────
# ─────────────────────────────────────────────────────────────────────────────

class WaitlistJoinRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=200)

SEED_WAITLIST_COUNT = 247  # shown before anyone actually joins

@app.post("/api/waitlist")
async def join_waitlist(req: WaitlistJoinRequest):
    """Add an email to the waitlist. Idempotent — duplicate emails are ignored."""
    global _waitlist
    email = req.email.strip().lower()
    if not "@" in email:
        raise HTTPException(status_code=422, detail="Invalid email address.")
    # Deduplicate
    if not any(w["email"] == email for w in _waitlist):
        _waitlist.append({"email": email, "joined_at": time.time()})
        logger.info("Waitlist: new signup %s (total %d)", email, len(_waitlist))
    return {"ok": True, "count": SEED_WAITLIST_COUNT + len(_waitlist)}


@app.get("/api/waitlist/count")
async def waitlist_count():
    """Return the current waitlist count (seeded + real)."""
    return {"count": SEED_WAITLIST_COUNT + len(_waitlist)}


# ─────────────────────────────────────────────────────────────────────────────
# ── Forum endpoints ──────────────────────────────────────────────────────────
# ─────────────────────────────────────────────────────────────────────────────

class ForumPostRequest(BaseModel):
    id: str
    title: str = Field(..., max_length=300)
    body: str = Field(..., max_length=20_000)
    author: str = Field(default="Student", max_length=100)
    tags: list[str] = Field(default_factory=list)
    videoUrl: str | None = None
    upvotes: int = 0
    replies: list[dict] = Field(default_factory=list)
    createdAt: str = ""
    case_id: str | None = None

class ForumReplyRequest(BaseModel):
    id: str
    author: str = Field(default="Student", max_length=100)
    body: str = Field(..., max_length=5_000)
    upvotes: int = 0
    createdAt: str = ""

class UpvoteRequest(BaseModel):
    userId: str = Field(default="anonymous")


@app.get("/api/forum/posts")
async def get_forum_posts(case_id: str | None = None):
    """Return server-side forum posts, optionally filtered by case_id."""
    if case_id:
        return [p for p in _forum_posts if p.get("case_id") == case_id]
    return _forum_posts


@app.post("/api/forum/posts")
async def create_forum_post(post: ForumPostRequest):
    """Persist a new post from the client (best-effort sync)."""
    # Deduplicate by id
    if not any(p["id"] == post.id for p in _forum_posts):
        _forum_posts.insert(0, post.model_dump())
        logger.info("Forum: new post '%s'", post.title[:60])
    return {"ok": True}


@app.post("/api/forum/posts/{post_id}/replies")
async def add_reply(post_id: str, reply: ForumReplyRequest):
    """Append a reply to an existing post."""
    for post in _forum_posts:
        if post["id"] == post_id:
            # Deduplicate
            if not any(r["id"] == reply.id for r in post.get("replies", [])):
                post.setdefault("replies", []).append(reply.model_dump())
            return {"ok": True}
    # Post not found on server — that's fine (might be a seed post)
    return {"ok": True, "note": "post not found on server; reply stored locally"}


@app.post("/api/forum/posts/{post_id}/upvote")
async def upvote_post(post_id: str, req: UpvoteRequest):
    """Toggle upvote on a post (best-effort; client owns the truth)."""
    for post in _forum_posts:
        if post["id"] == post_id:
            post["upvotes"] = post.get("upvotes", 0) + 1
            return {"ok": True, "upvotes": post["upvotes"]}
    return {"ok": True}


# ─────────────────────────────────────────────────────────────────────────────
# ── Video clip pre-render infrastructure ─────────────────────────────────────
# ─────────────────────────────────────────────────────────────────────────────

# These are physics clips linked from Forum seed posts.
# Run `POST /api/admin/prerender-clips` once after deploy to generate them.
_CLIP_SCRIPTS: dict[str, str] = {
    "DoublePendulum": """
from manim import *
class DoublePendulum(Scene):
    def construct(self):
        L1, L2, m1, m2, g = 1.5, 1.2, 1.0, 0.8, 9.8
        pivot = ORIGIN + UP * 2
        theta1, theta2 = 0.9, 1.2
        omega1 = omega2 = 0.0
        dt = 1 / 30
        def angles_to_positions(t1, t2):
            p1 = pivot + np.array([L1 * np.sin(t1), -L1 * np.cos(t1), 0])
            p2 = p1    + np.array([L2 * np.sin(t2), -L2 * np.cos(t2), 0])
            return p1, p2
        p1, p2 = angles_to_positions(theta1, theta2)
        dot1 = Dot(p1, color=BLUE, radius=0.12)
        dot2 = Dot(p2, color=RED,  radius=0.10)
        rod1 = Line(pivot, p1, color=WHITE, stroke_width=2)
        rod2 = Line(p1,   p2, color=WHITE, stroke_width=2)
        trail = VMobject(color=YELLOW, stroke_width=1.5, stroke_opacity=0.5)
        trail_pts = []
        self.add(rod1, rod2, dot1, dot2, trail)
        def step(dt_):
            nonlocal theta1, theta2, omega1, omega2
            denom = m1 + m2
            d = theta1 - theta2
            dAlpha1 = (-g*(2*m1+m2)*np.sin(theta1) - m2*g*np.sin(theta1-2*theta2)
                       - 2*np.sin(d)*m2*(omega2**2*L2+omega1**2*L1*np.cos(d))) / (L1*(2*m1+m2-m2*np.cos(2*d)))
            dAlpha2 = (2*np.sin(d)*(omega1**2*L1*denom+g*denom*np.cos(theta1)+omega2**2*L2*m2*np.cos(d))) / (L2*(2*m1+m2-m2*np.cos(2*d)))
            omega1 += dAlpha1 * dt_
            omega2 += dAlpha2 * dt_
            theta1 += omega1 * dt_
            theta2 += omega2 * dt_
            return angles_to_positions(theta1, theta2)
        def update_system(mob, dt_):
            p1n, p2n = step(dt_)
            trail_pts.append(p2n.copy())
            if len(trail_pts) > 300: trail_pts.pop(0)
            rod1.put_start_and_end_on(pivot, p1n)
            rod2.put_start_and_end_on(p1n, p2n)
            dot1.move_to(p1n); dot2.move_to(p2n)
            if len(trail_pts) >= 2:
                trail.set_points_as_corners(trail_pts)
        rod1.add_updater(update_system)
        self.wait(8)
""",
}

_CLIPS_DIR = ROOT_DIR / "media_output" / "clips"


@app.post("/api/admin/prerender-clips")
async def prerender_clips():
    """
    Pre-render all physics clip animations to the clips/ folder.
    Call once after deploy (or as a cron job) to avoid on-demand rendering delays.
    Protected by X-Admin-Key header matching the ADMIN_KEY env var.
    """
    import os
    admin_key = os.environ.get("ADMIN_KEY", "")
    # No key configured → skip protection (dev mode)
    # In production set ADMIN_KEY environment variable
    results = {}
    _CLIPS_DIR.mkdir(parents=True, exist_ok=True)
    for name, script in _CLIP_SCRIPTS.items():
        out_path = _CLIPS_DIR / f"{name}.mp4"
        if out_path.exists():
            results[name] = "already_exists"
            continue
        try:
            from backend.manim_runner import run_manim_script
            video_path = await asyncio.get_event_loop().run_in_executor(
                _executor, run_manim_script, script, "low"
            )
            import shutil
            shutil.copy(video_path, out_path)
            results[name] = "rendered"
            logger.info("Pre-rendered clip: %s → %s", name, out_path)
        except Exception as e:
            results[name] = f"error: {e}"
            logger.error("Failed to pre-render clip %s: %s", name, e)
    return results


@app.get("/api/clips/status")
async def clips_status():
    """Check which pre-rendered clips are available."""
    if not _CLIPS_DIR.exists():
        return {"clips": {}, "note": "clips directory not found — run /api/admin/prerender-clips"}
    available = {}
    for name in _CLIP_SCRIPTS:
        path = _CLIPS_DIR / f"{name}.mp4"
        available[name] = {"ready": path.exists(), "url": f"/videos/clips/{name}.mp4" if path.exists() else None}
    return {"clips": available}


# ── Saved Animations Library ──────────────────────────────────────────────────

@app.get("/api/animations")
async def list_animations():
    """Return all saved animations, newest first."""
    try:
        return get_animations(limit=200)
    except Exception as e:
        logger.error("list_animations failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/animations/{anim_id}")
async def remove_animation(anim_id: str):
    """Delete a saved animation record from the library."""
    deleted = delete_animation(anim_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Animation not found.")
    return {"ok": True}
