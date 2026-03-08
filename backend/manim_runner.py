import ast
import logging
import shutil
import subprocess
import sys
import time
import uuid
from pathlib import Path

logger = logging.getLogger(__name__)

ROOT_DIR = Path(__file__).resolve().parent.parent
MEDIA_OUTPUT_DIR = ROOT_DIR / "media_output"

MANIM_RENDER_TIMEOUT = 240  # increased from 120 to accommodate Coqui XTTS v2 TTS inference
CLEANUP_MAX_AGE_HOURS = 24


class ManimExecutionError(Exception):
    def __init__(self, message, stderr):
        super().__init__(message)
        self.stderr = stderr


def cleanup_old_media(max_age_hours: int = CLEANUP_MAX_AGE_HOURS) -> None:
    """Delete generated .py scripts and their media subdirs older than max_age_hours.
    Videos referenced in the animations DB are never deleted."""
    try:
        # Fetch protected video URLs from DB so saved animations survive cleanup
        protected_ids: set[str] = set()
        try:
            from backend.learn import get_saved_video_urls
            for url in get_saved_video_urls():
                # URL pattern: /media/videos/<uuid>/480p15/PhysicsAnimation.mp4
                parts = url.strip("/").split("/")
                if len(parts) >= 3 and parts[0] == "media":
                    protected_ids.add(parts[2])  # the UUID segment
        except Exception:
            pass

        cutoff = time.time() - max_age_hours * 3600
        media_videos = MEDIA_OUTPUT_DIR / "media" / "videos"

        for py_file in MEDIA_OUTPUT_DIR.glob("*.py"):
            script_id = py_file.stem
            if script_id in protected_ids:
                continue  # saved animation — keep forever
            if py_file.stat().st_mtime < cutoff:
                py_file.unlink(missing_ok=True)
                video_dir = media_videos / script_id
                if video_dir.is_dir():
                    shutil.rmtree(video_dir, ignore_errors=True)

        logger.debug("Cleanup complete (protected=%d)", len(protected_ids))
    except Exception as e:
        logger.debug("Cleanup skipped: %s", e)


def _check_syntax(code: str) -> None:
    """Raise ManimExecutionError with clear message if code has a syntax error."""
    try:
        ast.parse(code)
    except SyntaxError as e:
        msg = f"SyntaxError at line {e.lineno}: {e.msg}"
        if e.text:
            msg += f"\n  Line: {e.text.strip()}"
        raise ManimExecutionError(msg, msg)


_QUALITY_FLAGS = {
    "low":    ("-ql", "480p15"),
    "medium": ("-qm", "720p30"),
    "high":   ("-qh", "1080p60"),
}


def run_manim_script(code: str, quality: str = "low") -> str:
    """
    Executes the given Manim Python code and returns the path to the generated MP4.
    quality: "low" (480p15, fastest), "medium" (720p30), "high" (1080p60).
    Raises ManimExecutionError if execution fails.
    """
    code = (code or "").strip()
    if not code or "PhysicsAnimation" not in code:
        raise ManimExecutionError("Generated code is empty or missing PhysicsAnimation class.", "")

    _check_syntax(code)
    cleanup_old_media()

    quality_flag, quality_dir = _QUALITY_FLAGS.get(quality, _QUALITY_FLAGS["low"])

    work_dir = MEDIA_OUTPUT_DIR
    work_dir.mkdir(exist_ok=True)

    script_id = str(uuid.uuid4())
    script_path = work_dir / f"{script_id}.py"

    with open(script_path, "w", encoding="utf-8") as f:
        f.write(code)

    media_dir = work_dir / "media"

    cmd = [
        sys.executable,
        "-m", "manim",
        quality_flag,
        "--media_dir", str(media_dir),
        str(script_path),
        "PhysicsAnimation"
    ]

    try:
        subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=True,
            timeout=MANIM_RENDER_TIMEOUT,
            cwd=str(ROOT_DIR),
        )
        logger.info("Manim execution successful for %s (quality=%s)", script_id, quality)
    except subprocess.TimeoutExpired as e:
        raise ManimExecutionError(
            f"Manim render timed out after {MANIM_RENDER_TIMEOUT}s. Try a simpler animation.",
            e.stderr or "",
        )
    except subprocess.CalledProcessError as e:
        logger.error("Manim render failed:\n%s", e.stderr)
        raise ManimExecutionError(
            "Manim failed to compile the animation. See backend logs for details.",
            e.stderr or "",
        )

    # Find the generated mp4 under the quality-specific subdirectory
    script_media = media_dir / "videos" / script_id
    if not script_media.exists():
        raise ManimExecutionError("Manim produced no video output.", "")

    videos = list(script_media.rglob("*.mp4"))
    if not videos:
        raise ManimExecutionError("Manim ran but no MP4 was found.", "")

    # Prefer the canonical quality subdir, else fall back to any mp4
    preferred = [p for p in videos if quality_dir in str(p)]
    video_path = preferred[0] if preferred else videos[0]
    return str(video_path)
