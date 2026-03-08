import json
import logging
import os
import time
from pathlib import Path
import anthropic
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

load_dotenv(override=True)

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")

if not ANTHROPIC_API_KEY:
    raise ValueError("ANTHROPIC_API_KEY environment variable is missing. Get one from https://console.anthropic.com")

client = anthropic.Anthropic(
    api_key=ANTHROPIC_API_KEY,
    timeout=120.0,
)
MODEL_NAME = "claude-sonnet-4-6"   # Latest balanced model: planning, chat, scene generation
CODE_MODEL = "claude-opus-4-6"    # Latest flagship model: Manim code generation & self-correction

# Limit plan/code length to avoid token overflow and abuse
MAX_QUESTION_LENGTH = 4000
MAX_PLAN_LENGTH = 8000

# Keep the plan concise so it's better for visualization (fewer tokens, clearer for code gen)
MAX_PLAN_WORDS = 350

# We inject the LLM's output into this skeleton so structure is never wrong
MANIM_SKELETON = '''from manim import *
import math
import numpy as np
try:
    from manim_physics import *
except ImportError:
    pass
try:
    import pymunk
except ImportError:
    pymunk = None
try:
    from scipy.integrate import solve_ivp
    import scipy.signal
except ImportError:
    solve_ivp = None


class PhysicsAnimation(Scene):
    def construct(self):
'''

# ── Voiceover (Coqui XTTS v2 + 3Blue1Brown voice clone) ─────────────────────
_ASSETS_DIR = Path(__file__).resolve().parent / "assets"
_VOICE_WAV = _ASSETS_DIR / "3b1b_voice.wav"

try:
    import manim_voiceover as _mv  # noqa
    _MANIM_VOICEOVER_AVAILABLE = True
except ImportError:
    _MANIM_VOICEOVER_AVAILABLE = False

# Voiceover is enabled only when BOTH the library and the reference WAV exist.
VOICEOVER_ENABLED = _MANIM_VOICEOVER_AVAILABLE and _VOICE_WAV.exists()

if VOICEOVER_ENABLED:
    logger.info("Voiceover enabled: using %s", _VOICE_WAV)
else:
    logger.info(
        "Voiceover disabled (library=%s, voice_wav=%s). "
        "See backend/assets/VOICE_SETUP.md to enable.",
        _MANIM_VOICEOVER_AVAILABLE, _VOICE_WAV.exists()
    )

_VOICEOVER_SKELETON_TEMPLATE = """\
from manim import *
import math
import numpy as np
from manim_voiceover import VoiceoverScene
from manim_voiceover.services.coqui import CoquiService
try:
    from manim_physics import *
except ImportError:
    pass
try:
    import pymunk
except ImportError:
    pymunk = None
try:
    from scipy.integrate import solve_ivp
    import scipy.signal
except ImportError:
    solve_ivp = None


class PhysicsAnimation(VoiceoverScene):
    def construct(self):
        self.set_speech_service(
            CoquiService(
                model_name="tts_models/multilingual/multi-dataset/xtts_v2",
                speaker_wav=r"{voice_wav}",
                language="en",
            )
        )
"""

_VOICEOVER_PROMPT_HINT = """
VOICEOVER NARRATION (REQUIRED when voiceover is active):
- Wrap EVERY self.play() or self.wait() inside a `with self.voiceover("...") as tracker:` block.
- Write narration in the style of 3Blue1Brown (Grant Sanderson): conversational, intuition-first, curious tone.
- Use phrases like: "Think of it this way...", "Notice what happens here...", "But here's the key insight...", "What we're really asking is...", "And here's where it gets interesting..."
- Each voiceover block: 1-3 natural spoken sentences. Keep it concise and clear.
- Sync animation to audio: use `run_time=tracker.duration` on the self.play() call.
- NEVER call self.set_speech_service() — it is already configured in the skeleton.
- Example structure:
    with self.voiceover("Let's start by thinking about what this force actually means.") as tracker:
        self.play(Create(arrow), run_time=tracker.duration)
    with self.voiceover("Notice how as the angle increases, the horizontal component shrinks while the vertical one grows.") as tracker:
        self.play(angle_tracker.animate.set_value(60), run_time=tracker.duration)
"""


def _get_manim_skeleton() -> str:
    """Return the appropriate Manim script skeleton based on voiceover availability."""
    if not VOICEOVER_ENABLED:
        return MANIM_SKELETON
    return _VOICEOVER_SKELETON_TEMPLATE.format(voice_wav=str(_VOICE_WAV))


# ── Dangerous patterns to reject before sending to LLM ──────────────────────
_INJECTION_PATTERNS = [
    "ignore previous", "ignore all previous", "you are now", "forget your",
    "system:", "act as", "jailbreak", "override instructions",
    "import os", "import subprocess", "import sys", "__import__",
    "os.system", "subprocess.run", "subprocess.call", "shutil.rmtree",
    "open(", "exec(", "eval(", "compile(",
]

def sanitize_question(text: str) -> str:
    """
    Reject obvious prompt-injection and code-injection attempts.
    Returns the original text if safe, raises ValueError if dangerous.
    """
    lower = text.lower()
    for pattern in _INJECTION_PATTERNS:
        if pattern in lower:
            raise ValueError(
                f"Input contains a disallowed pattern: '{pattern}'. "
                "Please rephrase your physics question."
            )
    return text


def _call_llm(messages: list[dict], model: str = MODEL_NAME, max_retries: int = 3) -> str:
    """Call the Claude API with exponential backoff on transient errors.

    Claude accepts system messages as a top-level parameter, so we extract
    any system-role entries from the messages list and pass them separately.
    """
    system_parts = [m["content"] for m in messages if m.get("role") == "system"]
    user_messages = [m for m in messages if m.get("role") != "system"]
    system_text = "\n\n".join(system_parts) if system_parts else None

    # Claude requires max_tokens; use a larger budget for code generation
    max_tokens = 8192 if model == CODE_MODEL else 4096

    last_error = None
    for attempt in range(max_retries):
        try:
            kwargs: dict = {
                "model": model,
                "max_tokens": max_tokens,
                "messages": user_messages,
            }
            if system_text:
                kwargs["system"] = system_text

            response = client.messages.create(**kwargs)
            content = (response.content[0].text or "").strip()
            return content
        except (anthropic.RateLimitError, anthropic.APIConnectionError, anthropic.APIStatusError) as e:
            last_error = e
            wait = 2 ** attempt
            logger.warning("LLM call attempt %d failed (%s), retrying in %ds...", attempt + 1, type(e).__name__, wait)
            time.sleep(wait)
    raise last_error  # type: ignore[misc]


def _truncate_plan_to_word_limit(plan: str, max_words: int = MAX_PLAN_WORDS) -> str:
    """Truncate plan to max_words so code generation stays focused."""
    words = plan.split()
    if len(words) <= max_words:
        return plan
    return " ".join(words[:max_words])


def generate_animation_plan(question: str) -> str:
    """
    Call 1: Understand physics and generate a concise plan for animation.
    """
    if not (question or "").strip():
        raise ValueError("Question cannot be empty.")
    question = question.strip()[:MAX_QUESTION_LENGTH]

    prompt = f"""
You are an expert physics educator and Manim animator. A user asked: "{question}"

Give a SHORT, actionable plan for animating this in Manim (Python library).

Rules:
- Keep your ENTIRE response under {MAX_PLAN_WORDS} words. Be concise.
- One brief sentence on the physics, then a numbered list of 4–8 concrete animation steps.
- IMPORTANT: Always include steps for drawing force vectors (Arrow), labeling forces
  (Text for words, MathTex for symbols), and showing relevant equations with MathTex
  (e.g. MathTex(r"F=ma"), MathTex(r"\\theta"), MathTex(r"\\frac{{mv^2}}{{r}}")).
  Physics animations must show ALL relevant forces and their components, not just the motion.

DOMAIN-SPECIFIC GUIDANCE:
- Mechanics / pendulum / spring: include gravity, tension, normal, friction arrows.
  For pendulums, use scipy-solved ODE trajectory for accurate large-angle motion.
  For springs, use scipy.integrate.solve_ivp to compute x(t) and animate the mass.
- Collisions / rigid body: use pymunk pre-simulation for physically accurate trajectories;
  animate two Dots following the computed positions. Show momentum conservation equation.
- Circular motion: draw orbit circle, velocity tangent Arrow (GREEN), centripetal Arrow (RED).
  Label centripetal force, period, angular velocity with MathTex.
- Waves / interference: use always_redraw + ValueTracker for phase animation.
  Show wavelength λ, amplitude A, and equation y=A sin(kx−ωt) with MathTex.
- Electric field / Coulomb: draw radial Arrow fields around charges (+RED, −BLUE).
  Label F=kq₁q₂/r², show field direction with arrows.
- Magnetic field / Lorentz: draw concentric B-field circles (right-hand rule).
  Show F=qv×B with Arrow, label B=μ₀I/2πr.
- Optics / Snell's law: draw two media, normal line, incident/refracted/reflected rays.
  Mark angles θᵢ and θᵣ with Arc, show n₁sinθᵢ=n₂sinθᵣ.
- Gravity / orbital: draw planet (Circle) + satellite Dot orbiting with gravitational
  force Arrow toward center. Show F=GMm/r², orbital velocity, escape velocity.
- Thermodynamics / ideal gas: animate bouncing gas particles in a container (Rectangle).
  Show P-V diagram (Axes), isotherm curve, PV=nRT with MathTex.

- Each step should specify what Manim objects to use.
- No long explanations or tangents. Focus on what to draw and animate.
- If the user specifies numeric values (e.g. "k=10", "m=2 kg"), include them explicitly
  in step 1 as: "Set parameters: k=10, m=2 as Python variables."
"""

    content = _call_llm(
        messages=[
            {"role": "system", "content": (
                "You give very concise, visualization-focused Manim animation plans. "
                "Short sentences. Under 350 words total. "
                "Always mention which library/tool to use for simulations "
                "(scipy for ODE, pymunk for collisions, standard Manim for everything else)."
            )},
            {"role": "user", "content": prompt}
        ],
        model=MODEL_NAME,
    )
    if not content:
        raise ValueError("API returned an empty plan.")
    return _truncate_plan_to_word_limit(content)

def _clean_construct_body(raw: str) -> str:
    """Extract and clean only the body of construct(): strip prose, normalize indent to 8 spaces."""
    import ast as _ast
    if not (raw or "").strip():
        return "        self.wait()"
    s = raw.strip()
    if s.startswith("```"):
        parts = s.split("```")
        s = parts[1] if len(parts) > 1 else s
        if s.lower().startswith("python"):
            s = s[6:]
        s = s.strip()
    lines = s.splitlines()
    kept = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            kept.append("")
            continue
        if _looks_like_prose_line(line):
            continue
        # Strip out class/def/import lines the LLM might include despite instructions
        if stripped.startswith("from manim import") or stripped.startswith("import manim"):
            continue
        if stripped.startswith("from manim_voiceover") or stripped.startswith("import manim_voiceover"):
            continue
        if stripped.startswith("class ") and "Scene" in stripped:
            continue
        if stripped.startswith("def construct(self"):
            continue
        if stripped.startswith("self.set_speech_service("):
            continue
        kept.append(line)
    if not kept:
        return "        self.wait()"

    def _normalize(lines_in, base):
        """Normalize indent: compute min indent of non-blank lines, shift to base."""
        min_ind = 999
        for ln in lines_in:
            if ln.strip():
                min_ind = min(min_ind, len(ln) - len(ln.lstrip()))
        if min_ind == 999:
            min_ind = 0
        result = []
        for ln in lines_in:
            if not ln.strip():
                result.append("")
                continue
            ind = len(ln) - len(ln.lstrip())
            rel = max(0, ind - min_ind)
            result.append(" " * (base + rel) + ln.strip())
        return "\n".join(result).rstrip()

    body = _normalize(kept, 8)

    # Validate via AST; if indentation is broken, re-attempt with a flat normalization
    test_src = f"def _f(self):\n{body}\n    pass\n"
    try:
        _ast.parse(test_src)
    except SyntaxError:
        # Aggressive fix: find the most common indent level among non-blank lines
        # and treat that as the "base" level, re-normalizing everything relative to it
        indents = sorted(set(
            len(ln) - len(ln.lstrip()) for ln in kept if ln.strip()
        ))
        # Try every candidate base indent until we find one that parses
        fixed = body
        for candidate in indents:
            attempt = _normalize(
                [" " * max(0, (len(ln) - len(ln.lstrip())) - candidate) + ln.strip()
                 if ln.strip() else "" for ln in kept],
                8
            )
            test2 = f"def _f(self):\n{attempt}\n    pass\n"
            try:
                _ast.parse(test2)
                fixed = attempt
                break
            except SyntaxError:
                continue
        body = fixed

    if not body.strip():
        return "        self.wait()"
    return body


def _sanitize_undefined_physics_vars(body: str) -> str:
    """
    Remove lines that assign physics-notation variables (mv, Fc, v0, etc.)
    as bare Python arithmetic — these will always raise NameError at runtime.
    Safe numeric assignments like `v0 = 7` or `g = 9.8` are kept.
    Lines that are part of a string (MathTex/Text) or self.* calls are kept.
    """
    import re
    # Patterns like: mv = ..., Fc = ..., F_net = ..., p = mv * something
    # BUT allow lines that are string assignments or self.play / self.add etc.
    bad_physics_var = re.compile(
        r'^\s*(?:mv|Fc|F_c|F_net|KE|PE|p_momentum|angular_momentum|tau|torque)'
        r'\s*=\s*(?!MathTex|Text|Arrow|Line|Dot|Circle|VGroup|None|True|False|"|\')(.+)$'
    )
    safe_numeric = re.compile(r'^\s*[a-zA-Z_][a-zA-Z_0-9]*\s*=\s*[-0-9.]')
    lines = body.splitlines()
    result = []
    for line in lines:
        if bad_physics_var.match(line) and not safe_numeric.match(line):
            # Convert to a comment so at least we don't lose context
            result.append(line[:len(line) - len(line.lstrip())] + "# " + line.strip())
        else:
            result.append(line)
    return "\n".join(result)


def _extract_physics_conditions(text: str) -> dict:
    """
    Extract zero/special-value physics conditions from natural language phrasing.
    Examples:
      "no friction"        → {"mu": 0.0}
      "frictionless"       → {"mu": 0.0}
      "elastic collision"  → {"restitution": 1.0}
      "perfectly inelastic"→ {"restitution": 0.0}
      "no gravity"         → {"g": 0.0}
      "in vacuum"          → {"g": 0.0} (space context)
    These override any numerically-extracted values so explicit conditions win.
    """
    q = text.lower()
    conditions: dict[str, float] = {}

    import re as _cond_re

    # ── Friction ──────────────────────────────────────────────────────────────
    no_friction_phrases = (
        "no friction", "frictionless", "friction free", "friction-free",
        "without friction", "ignore friction", "smooth surface",
        "smooth floor", "smooth plane", "no resistive", "ideal surface",
    )
    # For "mu=0" / "μ=0", use regex to avoid matching "mu=0.4"
    _mu_zero_exact = bool(_cond_re.search(r'\bmu\s*=\s*0(?!\s*\.?\s*[1-9])', q) or
                          _cond_re.search(r'μ\s*=\s*0(?!\s*\.?\s*[1-9])', q))
    if any(p in q for p in no_friction_phrases) or _mu_zero_exact:
        conditions["mu"] = 0.0

    # ── Gravity ───────────────────────────────────────────────────────────────
    no_gravity_phrases = (
        "no gravity", "weightless", "zero gravity", "zero-g",
        "microgravity", "in space", "outer space", "without gravity",
        "ignore gravity", "g=0",
    )
    if any(p in q for p in no_gravity_phrases):
        conditions["g"] = 0.0

    # ── Collision type ────────────────────────────────────────────────────────
    if any(p in q for p in ("perfectly elastic", "elastic collision", "elastic")):
        if "inelastic" not in q:
            conditions.setdefault("restitution", 1.0)
    if any(p in q for p in ("perfectly inelastic", "completely inelastic",
                             "inelastic collision", "stick together", "sticks")):
        conditions["restitution"] = 0.0

    # ── Air resistance / drag ─────────────────────────────────────────────────
    if any(p in q for p in ("no air resistance", "vacuum", "in a vacuum",
                             "ignore air", "no drag", "no damping")):
        conditions["drag"] = 0.0

    return conditions


def _extract_numeric_params(text: str) -> dict:
    """
    Extract named numeric parameters from natural language.
    Handles: "a=10", "a is 10", "omega=5", "v0=20", "theta=45 degrees", etc.
    Returns a normalised dict: canonical_name -> float value.

    Deliberately EXCLUDES derived / computed names like v1f, v2f, p1, p2, KE, PE
    so injected params don't override physics that should be computed by the code.
    """
    import re as _re

    # Names that are COMPUTED quantities — never extract these
    _COMPUTED_NAMES = {
        "v1f", "v2f", "v1i", "v2i", "vf", "vi",
        "ke", "pe", "e_total", "p", "p1", "p2",
        "fc", "fn", "ft", "delta", "deltax", "deltav",
        "xmax", "ymax", "x_max", "y_max", "tmax", "t_max",
    }

    raw: dict[str, float] = {}
    for m in _re.finditer(
        r'\b([a-zA-Z][a-zA-Z0-9_]{0,12})\s*(?:=|is|equals?)\s*([-+]?[0-9]*\.?[0-9]+)',
        text, _re.IGNORECASE
    ):
        name = m.group(1).lower()
        if name in _COMPUTED_NAMES:
            continue
        if any(x in name for x in ("initial", "final", "after", "before", "result")):
            continue
        if len(name) > 12:
            continue
        raw[name] = float(m.group(2))

    # ── Natural-language patterns (no '=' required) ──────────────────────────
    # "theta 30degrees", "angle 45°", "at 60 degrees", "30 degree angle",
    # "change theta to 60", "set angle to 45", "theta to 30"
    _theta_pat = _re.search(
        r'(?:'
        r'(?:theta|angle)\s+(?:of\s+|to\s+)?(\d+\.?\d*)\s*(?:degrees?|deg|°)?'  # "theta 30", "theta to 60"
        r'|(?:change|set|make)\s+(?:theta|angle)\s+(?:to\s+|=\s*)?(\d+\.?\d*)'  # "change theta to 60"
        r'|(\d+\.?\d*)\s*(?:degrees?|deg|°)\s*(?:angle|launch|inclination|elevation)?'  # "30 degrees"
        r')',
        text, _re.IGNORECASE
    )
    if _theta_pat and "theta" not in raw and "angle" not in raw:
        _tv = _theta_pat.group(1) or _theta_pat.group(2) or _theta_pat.group(3)
        if _tv:
            raw["theta"] = float(_tv)

    # "change X to Y", "set X to Y", "make X = Y" — generic follow-up rephrasing
    for _chg_m in _re.finditer(
        r'(?:change|set|make|update)\s+([a-zA-Z][a-zA-Z0-9_]{0,10})\s+(?:to|=)\s*([-+]?\d*\.?\d+)',
        text, _re.IGNORECASE
    ):
        _chg_name = _chg_m.group(1).lower()
        _chg_val  = float(_chg_m.group(2))
        if _chg_name not in raw and _chg_name not in {"to", "from", "by"}:
            raw[_chg_name] = _chg_val

    # "X m/s", "speed of X", "velocity of X", "launch speed X", "initial speed X"
    _v0_pat = _re.search(
        r'(?:'
        r'(\d+\.?\d*)\s*m/s'                                        # "9 m/s"
        r'|(?:launch|initial|with)\s+(?:speed|velocity)\s+(?:of\s+|with\s+)?(\d+\.?\d*)'  # "launch speed 9"
        r'|(?:speed|velocity)\s+(?:of\s+)?(\d+\.?\d*)'             # "speed of 15"
        r')',
        text, _re.IGNORECASE
    )
    if _v0_pat and "v0" not in raw:
        _vv = _v0_pat.group(1) or _v0_pat.group(2) or _v0_pat.group(3)
        if _vv:
            raw["v0"] = float(_vv)

    # "spring constant X", "stiffness X", "k = X N/m" (without alias confusion)
    _k_spring_pat = _re.search(
        r'(?:spring\s+constant|stiffness|k\s+value)\s+(?:of\s+|=\s*)?(\d+\.?\d*)',
        text, _re.IGNORECASE
    )
    if _k_spring_pat and "k" not in raw and "k_wave" not in raw:
        raw["k"] = float(_k_spring_pat.group(1))

    # "mass of X kg", "X kg mass", "X kilograms"
    _mass_pat = _re.search(
        r'(?:mass\s+(?:of\s+)?(\d+\.?\d*)\s*k?g'           # "mass of 5 kg"
        r'|(\d+\.?\d*)\s*k?g\s+(?:mass|block|object)'      # "5 kg mass"
        r'|(\d+\.?\d*)\s*kilograms?)',                      # "5 kilograms"
        text, _re.IGNORECASE
    )
    if _mass_pat and "m" not in raw and "mass" not in raw:
        _mv = _mass_pat.group(1) or _mass_pat.group(2) or _mass_pat.group(3)
        if _mv:
            raw["m"] = float(_mv)

    # "length X m", "X metre(s)", "X meter(s)" — for pendulum L
    _len_pat = _re.search(
        r'(?:length\s+(?:of\s+)?(\d+\.?\d*)'               # "length of 2"
        r'|(\d+\.?\d*)\s*met(?:re|er)s?)',                  # "2 metres"
        text, _re.IGNORECASE
    )
    if _len_pat and "l" not in raw and "length" not in raw:
        _lv = _len_pat.group(1) or _len_pat.group(2)
        if _lv:
            raw["l"] = float(_lv)

    # ── Height (m) ──────────────────────────────────────────────────────────
    # "45 m high", "height of 10", "cliff 45 m", "from a height 20 m"
    _ht_pat = _re.search(
        r'(?:'
        r'(\d+\.?\d*)\s*m?\s*(?:high|tall)'                        # "45 m high"
        r'|(?:height|cliff|tower|building)\s+(?:of\s+)?(\d+\.?\d*)\s*m?' # "height of 45 m"
        r'|(?:from\s+(?:a\s+)?height\s+(?:of\s+)?)(\d+\.?\d*)'    # "from a height of 20"
        r')',
        text, _re.IGNORECASE
    )
    if _ht_pat and "h" not in raw and "height" not in raw and "high" not in raw:
        _hv = _ht_pat.group(1) or _ht_pat.group(2) or _ht_pat.group(3)
        if _hv:
            raw["h"] = float(_hv)

    # ── Force (Newtons) ───────────────────────────────────────────────────────
    # "10 newtons", "force of 15 N", "applied force 20N", "F=10N"
    _force_pat = _re.search(
        r'(?:(?:applied\s+)?force\s+(?:of\s+)?(\d+\.?\d*)\s*N?'
        r'|(\d+\.?\d*)\s*newtons?'
        r'|(\d+\.?\d*)\s*N\b(?!\s*/\s*m))',   # "10 N" but not "10 N/m" (spring)
        text, _re.IGNORECASE
    )
    if _force_pat and "f" not in raw and "F" not in raw:
        _fv = _force_pat.group(1) or _force_pat.group(2) or _force_pat.group(3)
        if _fv:
            raw["F"] = float(_fv)

    # ── Resistance (Ohms) ─────────────────────────────────────────────────────
    # "100 ohms", "resistance of 50 Ω", "50 ohm resistor"
    _res_pat = _re.search(
        r'(?:resistance\s+(?:of\s+)?(\d+\.?\d*)'
        r'|(\d+\.?\d*)\s*(?:ohms?|Ω))',
        text, _re.IGNORECASE
    )
    if _res_pat and "r" not in raw and "resistance" not in raw and "R" not in raw:
        _rv = _res_pat.group(1) or _res_pat.group(2)
        if _rv:
            raw["R"] = float(_rv)

    # ── Capacitance (Farads / microfarads) ────────────────────────────────────
    # "5 microfarads", "capacitance 10 uF", "2 mF"
    _cap_pat = _re.search(
        r'(?:capacitance\s+(?:of\s+)?(\d+\.?\d*)\s*(?:u|micro|m|milli)?F?'
        r'|(\d+\.?\d*)\s*(?:microfarads?|μF|uF)'
        r'|(\d+\.?\d*)\s*(?:millifarads?|mF)'
        r'|(\d+\.?\d*)\s*(?:farads?|[^μu]F\b))',
        text, _re.IGNORECASE
    )
    if _cap_pat and "c" not in raw and "C" not in raw and "capacitance" not in raw:
        _cv_raw = _cap_pat.group(1) or _cap_pat.group(4)  # farads directly
        _cv_uf  = _cap_pat.group(2)                        # microfarads
        _cv_mf  = _cap_pat.group(3)                        # millifarads
        if _cv_uf:
            raw["C"] = float(_cv_uf) * 1e-6
        elif _cv_mf:
            raw["C"] = float(_cv_mf) * 1e-3
        elif _cv_raw:
            raw["C"] = float(_cv_raw)

    # ── Frequency (Hz) ────────────────────────────────────────────────────────
    # "60 Hz", "frequency of 440 hertz", "440 hertz"
    _freq_pat = _re.search(
        r'(?:frequency\s+(?:of\s+)?(\d+\.?\d*)'
        r'|(\d+\.?\d*)\s*(?:hertz|Hz\b))',
        text, _re.IGNORECASE
    )
    if _freq_pat and "f" not in raw and "freq" not in raw and "frequency" not in raw:
        _fqv = _freq_pat.group(1) or _freq_pat.group(2)
        if _fqv:
            raw["freq"] = float(_fqv)

    # ── Wavelength (nm / m) ───────────────────────────────────────────────────
    # "wavelength 500 nm", "500 nanometres", "wavelength 600nm", "0.5 μm"
    _wl_pat = _re.search(
        r'(?:wavelength\s+(?:of\s+)?(\d+\.?\d*)\s*(?:nm|nanometres?|nanometers?)?'
        r'|(\d+\.?\d*)\s*(?:nm|nanometres?|nanometers?)'
        r'|(\d+\.?\d*)\s*(?:μm|microns?))',
        text, _re.IGNORECASE
    )
    if _wl_pat and "lambda" not in raw and "wavelength" not in raw and "lam" not in raw:
        _wv_nm  = _wl_pat.group(1) or _wl_pat.group(2)
        _wv_um  = _wl_pat.group(3)
        if _wv_nm:
            raw["lambda"] = float(_wv_nm) * 1e-9
        elif _wv_um:
            raw["lambda"] = float(_wv_um) * 1e-6

    # ── Charge (Coulombs) ─────────────────────────────────────────────────────
    # "charge of 2 C", "2 coulombs", "3 microcoulombs"
    _charge_pat = _re.search(
        r'(?:charge\s+(?:of\s+)?(\d+\.?\d*)\s*(?:C|coulombs?)?'
        r'|(\d+\.?\d*)\s*(?:coulombs?)'
        r'|(\d+\.?\d*)\s*(?:microcoulombs?|μC|uC))',
        text, _re.IGNORECASE
    )
    if _charge_pat and "q1" not in raw and "q2" not in raw and "charge" not in raw:
        _qv_C  = _charge_pat.group(1) or _charge_pat.group(2)
        _qv_uC = _charge_pat.group(3)
        if _qv_uC:
            raw["q1"] = float(_qv_uC) * 1e-6
        elif _qv_C:
            raw["q1"] = float(_qv_C)

    # ── Mass with units (kg phrasing) ─────────────────────────────────────────
    # "ball weighing 3 kg", "3 kilogram ball/block/object", "mass of 5 kilograms"
    _kg_pat = _re.search(
        r'(?:(?:weighing|weighs)\s+(\d+\.?\d*)\s*k?g'
        r'|(\d+\.?\d*)\s*kilograms?'
        r'|mass\s+(?:of\s+)?(\d+\.?\d*)\s*kilograms?)',
        text, _re.IGNORECASE
    )
    if _kg_pat and "m" not in raw and "mass" not in raw and "m_mass" not in raw:
        _kgv = _kg_pat.group(1) or _kg_pat.group(2) or _kg_pat.group(3)
        if _kgv:
            raw["m"] = float(_kgv)

    # ── Voltage / EMF ─────────────────────────────────────────────────────────
    # "12 volts", "voltage of 9 V", "9V battery"
    _volt_pat = _re.search(
        r'(?:voltage\s+(?:of\s+)?(\d+\.?\d*)'
        r'|(\d+\.?\d*)\s*(?:volts?|V\b))',
        text, _re.IGNORECASE
    )
    if _volt_pat and "v" not in raw and "V" not in raw and "voltage" not in raw:
        _vv = _volt_pat.group(1) or _volt_pat.group(2)
        if _vv:
            raw["V"] = float(_vv)

    # Canonical name mapping
    _is_spring_ctx = any(w in text.lower() for w in ("spring", "hooke", "shm", "oscillat", "stiffness"))
    _is_wave_ctx   = any(w in text.lower() for w in ("wave", "wavelength", "wavenumber", "diffraction", "interference"))

    aliases = {
        # wave
        "a": "A", "amplitude": "A",
        "omega": "omega", "w": "omega", "angular_frequency": "omega",
        # k → spring constant when spring context, else wave-number
        "k": "k" if _is_spring_ctx and not _is_wave_ctx else "k_wave",
        "wavenumber": "k_wave",
        "f": "freq", "frequency": "freq",
        "period": "T_wave",
        # projectile / velocity
        "v0": "v0", "initial_velocity": "v0",
        "theta": "theta0", "angle": "theta0",
        "g": "g", "gravity": "g",
        # pendulum / spring
        "l": "L", "length": "L",
        "m": "m_mass", "mass": "m_mass",
        # collision
        "v1": "v1x", "v2": "v2x",         # user writes v1=4, we map to v1x
        "m1": "m1", "m2": "m2",
        "e": "restitution", "coefficient": "restitution",
        # force / applied
        "mu": "mu", "friction": "mu",
        "F": "F", "force": "F",
        # spring
        "k_spring": "k",
        # time
        "t": "t_end", "time": "t_end",
        # charges / electric
        "q1": "q1", "q2": "q2",
        "charge": "q1",
        # circuit
        "R": "R", "resistance": "R",
        "C": "C", "capacitance": "C",
        "V": "V", "voltage": "V", "emf": "V",
        # optics / waves
        "lambda": "lambda", "wavelength": "lambda", "lam": "lambda",
        # frequency
        "freq": "freq", "hz": "freq", "hertz": "freq",
        # radius / velocity
        "r": "r", "radius": "r",
        "v": "v",
        # height (projectile from cliff, freefall)
        "h": "h", "height": "h", "h0": "h", "high": "h",
        # rotational
        "i": "I", "inertia": "I",
        "alpha": "alpha",
        "tau_val": "tau",
        # circuit
        "resistance": "R",
        "capacitance": "C",
        "voltage": "V", "emf": "V",
        # fluid
        "density": "rho", "rho_fluid": "rho",
        "volume": "V",
        # nuclear
        "halflife": "t_half", "half_life": "t_half",
        "n0": "N0", "atoms": "N0",
        # quantum
        "quantum_number": "n",
        "box_length": "L",
        # optics
        "n1": "n1", "n2": "n2",
        # doppler
        "v_source": "vs", "vsource": "vs",
        "v_sound": "v_sound",
        # relativity
        "beta": "v", "lorentz": "v",
        # diffraction
        "wavelength": "lambda", "lam": "lambda",
        "slit_sep": "d", "slit": "d",
    }
    out: dict[str, float] = {}
    for raw_name, val in raw.items():
        canonical = aliases.get(raw_name, raw_name)
        out[canonical] = val

    # Physics condition phrases override extracted numeric values
    # e.g., "no friction" always wins over "mu=0.3" if both appear
    conditions = _extract_physics_conditions(text)
    out.update(conditions)

    return out


def _params_preamble(params: dict) -> str:
    """Return an 8-space-indented Python preamble defining the given numeric params."""
    if not params:
        return ""
    lines = [f"        {k} = {v}" for k, v in params.items()]
    return "\n".join(lines)


def pymunk_simulate_collision(params: dict) -> str:
    """
    Run a simple Pymunk 2D rigid-body simulation and return the trajectory
    as a Python string (list of dicts) ready to be embedded in Manim code.
    If pymunk is not installed, returns an empty string.
    Params: m1, m2, v1x, v2x, restitution, g, steps, dt
    """
    try:
        import pymunk

        m1      = float(params.get("m1", params.get("m_mass", 1.0)))
        m2      = float(params.get("m2", 1.0))
        v1x     = float(params.get("v1x", params.get("v0", 3.0)))
        v2x     = float(params.get("v2x", 0.0))   # default stationary target
        e       = float(params.get("restitution", 0.9))
        steps   = int(params.get("steps", 120))
        dt      = float(params.get("dt", 1 / 30))

        space = pymunk.Space()
        space.gravity = (0, 0)  # horizontal collision

        def _make_ball(mass, pos_x, vel_x, radius=0.3):
            moment = pymunk.moment_for_circle(mass, 0, radius)
            body = pymunk.Body(mass, moment)
            body.position = (pos_x, 0)
            body.velocity = (vel_x, 0)
            shape = pymunk.Circle(body, radius)
            shape.elasticity = e
            shape.friction = 0
            space.add(body, shape)
            return body, shape

        b1, s1 = _make_ball(m1, -2.0, v1x)
        b2, s2 = _make_ball(m2,  2.0, v2x)

        traj = []
        for _ in range(steps):
            traj.append({
                "t": round(_ * dt, 3),
                "x1": round(b1.position.x, 3),
                "y1": round(b1.position.y, 3),
                "x2": round(b2.position.x, 3),
                "y2": round(b2.position.y, 3),
            })
            space.step(dt)

        return repr(traj)
    except Exception as exc:
        logger.warning("pymunk simulation failed (non-fatal): %s", exc)
        return ""


_TEMPLATE_KEYWORDS: list[tuple[list[str], str]] = [
    (["collision", "collide", "elastic", "inelastic", "billiard", "momentum", "newton's cradle"], "collision"),
    (["spring", "hooke", "shm", "simple harmonic", "oscillat"], "spring"),
    (["projectile", "parabola", "launch", "trajectory", "thrown horizontally", "thrown", "cliff", "ball is thrown"], "projectile"),
    (["pendulum", "simple pendulum", "double pendulum"], "pendulum"),
    (["standing wave", "sound wave", "light wave", "wave propagat", "transverse wave", "longitudinal wave", "wave equation", "interference pattern wave"], "wave"),
    (["force", "newton", "friction", "block", "free body"], "force"),
    (["circular motion", "centripetal", "centrifugal", "uniform circular"], "circular"),
    (["electric field", "coulomb", "point charge", "electrostatic"], "electric"),
    (["magnetic field", "lorentz", "ampere", "solenoid", "electromagnet", "faraday"], "magnetic"),
    (["optic", "refract", "reflect", "snell", "lens", "light ray", "total internal"], "optics"),
    (["free fall", "freefall", "falling body", "falling object", "falling ball", "dropped from", "ball drop", "free-fall"], "freefall"),
    (["gravity", "gravitational", "kepler", "orbital", "satellite", "escape velocity"], "gravity"),
    (["thermo", "ideal gas", "kinetic theory", "carnot", "heat", "gas law", "pv diagram"], "thermo"),
    # Extended domains
    (["buoyan", "archimedes", "fluid", "bernoulli", "hydrostatic", "floati", "submerge", "density fluid"], "fluid"),
    (["torque", "moment of inertia", "angular momentum", "angular velocity", "rotational", "spinning", "gyroscop", "rolling down"], "rotational"),
    (["circuit", "ohm", "kirchhoff", "rc circuit", "rlc", "resistor", "capacitor", "inductor", "voltage divider"], "circuit"),
    (["doppler", "doppler effect", "frequency shift", "moving source", "beats frequency", "resonance harmonic"], "doppler"),
    (["quantum", "wave function", "schrodinger", "uncertainty principle", "de broglie", "photoelectric", "heisenberg", "particle in a box"], "quantum"),
    (["nuclear", "radioactive", "radioactivity", "half-life", "fission", "fusion", "decay constant"], "nuclear"),
    (["double slit", "young's", "diffract", "fringe pattern", "single slit", "diffraction grating", "wavelength interference"], "diffraction"),
    (["relativity", "time dilation", "lorentz factor", "special relativity", "twin paradox", "length contraction"], "relativity"),
    # Broader wave — must come AFTER diffraction so "wavelength" doesn't hijack
    (["wave", "interference"], "wave"),
]


def match_template(question: str) -> str | None:
    """Return the template domain name if the question matches a known template, else None."""
    q = question.lower()
    for keywords, domain in _TEMPLATE_KEYWORDS:
        if any(k in q for k in keywords):
            return domain
    return None


def _escape_text_for_code(text: str, max_len: int = 70) -> str:
    safe = (text or "").replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ").strip()
    return safe[:max_len] if safe else "Physics Concept"


def _scipy_pendulum_trajectory(theta0_rad: float, L: float, g: float, t_end: float, n_pts: int = 200):
    """Solve pendulum ODE with scipy.integrate.solve_ivp. Returns (t_arr, theta_arr)."""
    try:
        from scipy.integrate import solve_ivp
        import numpy as _np

        def _pend_ode(t, y):
            th, dth = y
            return [dth, -(g / L) * _np.sin(th)]

        sol = solve_ivp(_pend_ode, [0, t_end], [theta0_rad, 0],
                        max_step=t_end / n_pts, t_eval=_np.linspace(0, t_end, n_pts))
        return sol.t.tolist(), sol.y[0].tolist()
    except Exception as exc:
        logger.warning("scipy pendulum ODE failed (non-fatal): %s", exc)
        return None, None


def _scipy_spring_trajectory(x0: float, v0: float, k: float, m: float, t_end: float, n_pts: int = 200):
    """Solve spring-mass ODE with scipy. Returns (t_arr, x_arr)."""
    try:
        from scipy.integrate import solve_ivp
        import numpy as _np

        omega0 = (k / m) ** 0.5

        def _spring_ode(t, y):
            x, vx = y
            return [vx, -(omega0 ** 2) * x]

        sol = solve_ivp(_spring_ode, [0, t_end], [x0, v0],
                        max_step=t_end / n_pts, t_eval=_np.linspace(0, t_end, n_pts))
        return sol.t.tolist(), sol.y[0].tolist()
    except Exception as exc:
        logger.warning("scipy spring ODE failed (non-fatal): %s", exc)
        return None, None


def generate_template_manim_code(question: str, params: dict | None = None) -> str:
    """
    Guaranteed-safe fallback templates by keyword so we still render a video.
    Covers: projectile, pendulum (scipy ODE), wave, force/Newton,
            spring/SHM (scipy ODE), collision (pymunk), circular motion,
            electric field, magnetic field, optics/Snell, orbit/gravity,
            thermodynamics/ideal gas.
    `params` is an optional dict of numeric values extracted from the user's question.
    """
    q = (question or "").lower()
    title = _escape_text_for_code(question)
    if params is None:
        params = _extract_numeric_params(question)

    # ── Collision (elastic / inelastic) ──────────────────────────────────────
    if any(k in q for k in ("collision", "collide", "elastic", "inelastic",
                             "billiard", "newton's cradle", "momentum")):
        import math as _math
        _m1  = float(params.get("m1", params.get("m_mass", 1.0)))
        _m2  = float(params.get("m2", 1.5))
        _v1  = float(params.get("v1x", params.get("v0", 4.0)))
        _v2  = float(params.get("v2x", 0.0))
        _e   = float(params.get("restitution", 1.0))   # 1 = elastic, 0 = perfectly inelastic
        _inelastic = (_e < 0.5)
        # Analytical 1-D collision result
        _denom = _m1 + _m2
        _v1f = round(((_m1 - _e * _m2) * _v1 + (1 + _e) * _m2 * _v2) / _denom, 3)
        _v2f = round(((_m2 - _e * _m1) * _v2 + (1 + _e) * _m1 * _v1) / _denom, 3)
        _vcm = round((_m1 * _v1 + _m2 * _v2) / _denom, 3)  # for perfectly inelastic
        _KE_i = round(0.5 * _m1 * _v1**2 + 0.5 * _m2 * _v2**2, 2)
        _KE_f = round(0.5 * _m1 * _v1f**2 + 0.5 * _m2 * _v2f**2, 2)
        _KE_lost = round(_KE_i - _KE_f, 2)
        # Post-collision direction for ball1
        _move1_dir = "LEFT*2" if _v1f < 0 else "RIGHT*0.5"
        # Type label
        _type_str  = "Perfectly Inelastic" if _e == 0 else ("Elastic" if _e == 1.0 else f"Inelastic (e={_e})")
        # Post-collision animation: inelastic → balls move together; elastic → separate
        if _inelastic:
            _post_anim = (
                f"        # Balls stick together after collision\n"
                f"        combined = VGroup(ball1, ball2, lbl1, lbl2)\n"
                f"        self.play(combined.animate.shift(RIGHT * 1.8), run_time=1.5, rate_func=linear)\n"
                f"        self.play(Write(result), Write(ke_f), Write(ke_lost_lbl))\n"
            )
            _ke_lost_line = f"        ke_lost_lbl = MathTex(r'\\Delta KE = {_KE_lost}\\,J\\,(lost)', font_size=20, color=RED_B).to_corner(UR).shift(DOWN*1.3)\n"
        else:
            _post_anim = (
                f"        self.play(\n"
                f"            ball1.animate.shift({_move1_dir}),\n"
                f"            lbl1.animate.shift({_move1_dir}),\n"
                f"            ball2.animate.shift(RIGHT*2.5),\n"
                f"            lbl2.animate.shift(RIGHT*2.5),\n"
                f"            run_time=1.5, rate_func=linear\n"
                f"        )\n"
                f"        self.play(Write(result), Write(ke_f))\n"
            )
            _ke_lost_line = ""

        body = (
            f"        title = Text(\"{title}\", font_size=28).to_edge(UP)\n"
            f"        type_lbl = Text(\"{_type_str}\", font_size=20, color=YELLOW).next_to(title, DOWN, buff=0.1)\n"
            f"        ground = Line(LEFT*6+DOWN*1.5, RIGHT*6+DOWN*1.5, color=GREY, stroke_width=2)\n"
            f"        r1, r2 = {round(0.35+0.05*(_m1-1),3)}, {round(0.35+0.05*(_m2-1),3)}\n"
            f"        ball1 = Circle(radius=r1, color=BLUE, fill_opacity=0.9).move_to(LEFT*3.5+DOWN*1.5+UP*r1)\n"
            f"        ball2 = Circle(radius=r2, color=RED,  fill_opacity=0.9).move_to(RIGHT*1.5+DOWN*1.5+UP*r2)\n"
            # Labels compiled ONCE, repositioned via add_updater
            f"        lbl1 = MathTex(r'm_1={_m1}\\,kg', font_size=22, color=BLUE)\n"
            f"        lbl1.add_updater(lambda m: m.next_to(ball1, UP, buff=0.1))\n"
            f"        lbl2 = MathTex(r'm_2={_m2}\\,kg', font_size=22, color=RED)\n"
            f"        lbl2.add_updater(lambda m: m.next_to(ball2, UP, buff=0.1))\n"
            f"        v_arrow = always_redraw(lambda: Arrow(\n"
            f"            ball1.get_right()+RIGHT*0.05, ball1.get_right()+RIGHT*1.2,\n"
            f"            color=GREEN, buff=0, max_tip_length_to_length_ratio=0.25\n"
            f"        ))\n"
            f"        v_lbl = MathTex(r'v_{{1i}}={_v1}\\,m/s', font_size=22, color=GREEN)\n"
            f"        v_lbl.add_updater(lambda m: m.next_to(v_arrow, DOWN, buff=0.1))\n"
            f"        eq_mom  = MathTex(r'm_1 v_1 + m_2 v_2 = \\mathrm{{const}}', font_size=24, color=WHITE).to_edge(DOWN).shift(UP*0.1)\n"
            f"        eq_e    = MathTex(r'e={_e}', font_size=22, color=YELLOW).next_to(eq_mom, UP, buff=0.2)\n"
            f"        ke_i    = MathTex(r'KE_i = {_KE_i}\\,J', font_size=20, color=BLUE_B).to_corner(UR).shift(DOWN*0.8)\n"
            f"        result  = MathTex(r'v_{{1f}}={_v1f}\\,m/s,\\;v_{{2f}}={_v2f}\\,m/s', font_size=22, color=YELLOW).to_corner(UR).shift(DOWN*0.4)\n"
            f"        ke_f    = MathTex(r'KE_f = {_KE_f}\\,J', font_size=20, color=GREEN_B).to_corner(UR).shift(DOWN*1.3)\n"
            + _ke_lost_line +
            f"        self.play(Write(title), Write(type_lbl))\n"
            f"        self.play(Create(ground), FadeIn(ball1), FadeIn(ball2))\n"
            f"        self.add(lbl1, lbl2, v_arrow, v_lbl)\n"
            f"        self.play(Write(eq_mom), Write(eq_e), Write(ke_i))\n"
            f"        self.play(ball1.animate.move_to(RIGHT*0.0+DOWN*1.5+UP*r1), run_time=1.2, rate_func=linear)\n"
            f"        self.play(Flash(ball1.get_right(), color=YELLOW, line_length=0.3, num_lines=10, run_time=0.3))\n"
            f"        self.play(FadeOut(v_arrow), FadeOut(v_lbl))\n"
            + _post_anim +
            f"        self.wait(0.5)\n"
        )
        return _get_manim_skeleton() + body

    # ── Spring / Hooke's law / SHM ───────────────────────────────────────────
    if any(k in q for k in ("spring", "hooke", "shm", "simple harmonic", "oscillat")):
        import math as _math
        _k  = params.get("k", params.get("k_wave", 10.0))
        # Support two-mass systems: use reduced mass μ = m1*m2/(m1+m2)
        _m1 = params.get("m1", None)
        _m2 = params.get("m2", None)
        if _m1 is not None and _m2 is not None:
            _m = round((_m1 * _m2) / (_m1 + _m2), 4)  # reduced mass
        else:
            _m = params.get("m_mass", params.get("m", 1.0))
        _x0 = params.get("x0", params.get("A", 2.0))
        _v0 = params.get("v0", 0.0)
        _om = (_k / _m) ** 0.5
        _T  = round(2 * _math.pi / _om, 3)
        # Cap at 2 periods max to keep render time short
        _t_end = min(max(2 * _T, 4.0), 8.0)
        t_arr, x_arr = _scipy_spring_trajectory(_x0, _v0, _k, _m, _t_end)
        if t_arr is None:
            # Analytical fallback
            t_arr = [i * _t_end / 100 for i in range(101)]
            x_arr = [_x0 * _math.cos(_om * t) + (_v0 / _om) * _math.sin(_om * t) for t in t_arr]
        # Clamp positions to screen
        _scale = min(2.5, 2.5 / max(abs(x) for x in x_arr))
        body = f"""        import math
        k_spring, m_mass, x0, v0_s = {_k}, {_m}, {_x0}, {_v0}
        omega0 = math.sqrt(k_spring / m_mass)
        T_period = {_T}
        t_data = {t_arr[:120]}
        x_data = {[round(x * _scale, 4) for x in x_arr[:120]]}
        title = Text("{title}", font_size=28).to_edge(UP)
        wall = Rectangle(width=0.3, height=2, color=GREY, fill_opacity=0.9).move_to(LEFT * 4)
        anchor = wall.get_right()
        eq_lbl  = MathTex(r"F = -kx", font_size=28, color=WHITE).to_corner(UR).shift(DOWN*0.8)
        T_lbl   = MathTex(r"T = 2\\pi/\\omega_0 = {_T}\\,s", font_size=22, color=YELLOW).to_corner(UR).shift(DOWN*1.4)
        om_lbl  = MathTex(r"\\omega_0 = \\sqrt{{k/m}} = {round(_om,3)}\\,rad/s", font_size=22, color=GREEN).to_corner(UR).shift(DOWN*2.0)
        eq_pos = Dot(color=YELLOW).move_to(anchor + RIGHT * 0)
        equilibrium = DashedLine(anchor + RIGHT * 0 + UP * 1, anchor + RIGHT * 0 + DOWN * 1, color=YELLOW, stroke_width=1.5)
        mass = Square(side_length=0.6, color=BLUE, fill_opacity=0.8).move_to(anchor + RIGHT * x_data[0])
        spring_line = always_redraw(lambda: Line(anchor, mass.get_left(), color=ORANGE, stroke_width=4))
        x_arrow = always_redraw(lambda: Arrow(
            anchor, mass.get_center(), color=GREEN, buff=0,
            max_tip_length_to_length_ratio=0.15, stroke_width=2
        ))
        x_label = MathTex(r"x", font_size=22, color=GREEN)
        x_label.add_updater(lambda m: m.next_to(x_arrow, DOWN, buff=0.1))
        self.play(Write(title))
        self.play(Create(wall), Create(equilibrium), FadeIn(mass))
        self.add(spring_line, x_arrow, x_label)
        self.play(Write(eq_lbl), Write(T_lbl), Write(om_lbl))
        x_tracker = ValueTracker(x_data[0])
        mass.add_updater(lambda m: m.move_to(anchor + RIGHT * x_tracker.get_value()))
        self.add(x_tracker)
        self.play(x_tracker.animate.set_value(x_data[len(x_data)//2]), run_time={round(min(5.0, _t_end)/2, 2)}, rate_func=linear)
        self.play(x_tracker.animate.set_value(x_data[-1]), run_time={round(min(5.0, _t_end)/2, 2)}, rate_func=linear)
        self.wait(0.5)"""
        return _get_manim_skeleton() + body

    if any(k in q for k in ("projectile", "parabola", "launch", "trajectory",
                              "horizontally", "thrown horizontal", "cliff")):
        import math as _math
        _v0    = params.get("v0", 7.0)
        _h0    = params.get("h", params.get("H", params.get("height", 0.0)))
        _is_horiz = ("horizontally" in q or "horizontal" in q) and _h0 > 0
        _theta_deg = 0.0 if _is_horiz else params.get("theta0", 45.0)
        _theta = _math.radians(_theta_deg)
        _g     = params.get("g", 9.8)
        _vx    = _v0 * _math.cos(_theta)
        _vy0   = _v0 * _math.sin(_theta)

        if _h0 > 0 and _vy0 == 0:
            _t_max = round(_math.sqrt(2 * _h0 / _g), 3) if _g > 0 else 2.0
        elif _h0 > 0:
            _disc = _vy0**2 + 2 * _g * _h0
            _t_max = round((_vy0 + _math.sqrt(max(0, _disc))) / _g, 3) if _g > 0 else 2.0
        else:
            _t_max = round(2 * _vy0 / _g, 3) if _g > 0 else 2.0

        _x_max = round(_vx * _t_max, 2)
        _y_peak = _h0 + (_vy0 ** 2) / (2 * _g) if _g > 0 else _h0 + 2.0
        _x_ax  = max(6.0, round(_x_max + 1, 1))
        _y_ax  = max(3.0, round(_y_peak + 1, 1))
        _scale_h0 = round(_h0 / max(_y_ax, 1) * 4, 2)

        if _h0 > 0:
            _path_expr = f"lambda x: {_h0} + x * math.tan(theta) - (g / (2 * vx**2)) * x**2"
            _eq_str = f"y = h_0 + v_0 \\sin\\theta \\cdot t - \\frac{{1}}{{2}}gt^2"
            _params_str = f"v_0={_v0},\\;h_0={_h0}\\,m,\\;\\theta={_theta_deg}^\\circ"
        else:
            _path_expr = f"lambda x: x * math.tan(theta) - (g / (2 * vx**2)) * x**2"
            _eq_str = f"y = v_0 \\sin\\theta \\cdot t - \\frac{{1}}{{2}}gt^2"
            _params_str = f"v_0={_v0},\\;\\theta={_theta_deg}^\\circ,\\;g={_g}"

        body = f"""        import math
        v0, theta_deg, g, h0 = {_v0}, {_theta_deg}, {_g}, {_h0}
        theta = math.radians(theta_deg)
        vx = v0 * math.cos(theta)
        vy0 = v0 * math.sin(theta)
        t_max = {_t_max}
        x_max = {_x_max}
        title = Text("{title}", font_size=26).to_edge(UP)
        axes = Axes(x_range=[0, {_x_ax}, {max(1, round(_x_ax/6))}], y_range=[0, {_y_ax}, {max(1, round(_y_ax/5))}], x_length=8, y_length=4).shift(DOWN * 0.5)
        labels = axes.get_axis_labels(MathTex("x\\,(m)"), MathTex("y\\,(m)"))
        path_fn = {_path_expr}
        path = axes.plot(path_fn, x_range=[0, x_max], color=YELLOW)
        dot = Dot(color=RED, radius=0.1).move_to(path.get_start())
        vx_arrow = always_redraw(lambda: Arrow(
            dot.get_center(), dot.get_center() + RIGHT * 1.0,
            color=GREEN, buff=0, max_tip_length_to_length_ratio=0.3, stroke_width=3
        ))
        vy_val = ValueTracker(vy0)
        vy_arrow = always_redraw(lambda: Arrow(
            dot.get_center(),
            dot.get_center() + DOWN * min(1.2, max(0.1, abs(vy_val.get_value()) / max(abs(g * t_max), 0.01))),
            color=BLUE, buff=0, max_tip_length_to_length_ratio=0.3, stroke_width=3
        ))
        vx_label = MathTex(r"v_x = {round(_vx, 1)}\\,\\text{{m/s}}", font_size=22, color=GREEN).to_corner(UR).shift(DOWN*0.8)
        vy_label = MathTex(r"v_y = g \\cdot t", font_size=22, color=BLUE).to_corner(UR).shift(DOWN*1.4)
        eq = MathTex(r"{_eq_str}", font_size=22, color=WHITE).to_edge(DOWN)
        params_label = MathTex(r"{_params_str}", font_size=20, color=YELLOW).to_corner(UR).shift(DOWN*0.4)
        g_arrow = always_redraw(lambda: Arrow(dot.get_center(), dot.get_center() + DOWN * 0.6, color=RED, buff=0, max_tip_length_to_length_ratio=0.3, stroke_width=2))
        g_lbl = MathTex(r"g={_g}", font_size=18, color=RED).to_edge(DOWN).shift(UP*0.7 + RIGHT*3)
        t_label = MathTex(r"t = {round(_t_max, 2)}\\,\\text{{s}},\\;x = {_x_max}\\,\\text{{m}}", font_size=20, color=ORANGE).to_corner(DL).shift(UP*0.6)
        self.play(Write(title))
        self.play(Create(axes), Write(labels))
        self.play(Write(vx_label), Write(vy_label), Write(eq), Write(params_label), Write(g_lbl))
        self.play(Create(path), run_time=1.5)
        self.add(dot, vx_arrow, vy_arrow, g_arrow)
        self.play(MoveAlongPath(dot, path), vy_val.animate.set_value(-g * t_max), run_time=2.5, rate_func=linear)
        self.play(Write(t_label))
        self.wait(0.5)"""
        return _get_manim_skeleton() + body

    if any(k in q for k in ("pendulum", "double pendulum", "simple pendulum")) and "wave" not in q:
        import math as _math
        _L      = params.get("L", 2.5)
        _g      = params.get("g", 9.8)
        _theta0_deg = params.get("theta0", 40.0)
        _theta0 = _math.radians(_theta0_deg)
        _t_end  = params.get("t_end", 6.0)
        _L_disp = min(max(_L * 0.9, 1.0), 3.0)
        # Solve ODE for accurate large-angle motion
        t_arr, theta_arr = _scipy_pendulum_trajectory(_theta0, _L, _g, _t_end, n_pts=180)
        if t_arr is None:
            # Pure ValueTracker fallback (small-angle approx)
            theta_arr = None
        body = f"""        import math
        L_len, g_acc = {_L}, {_g}
        L_disp = {_L_disp}
        t_arr   = {t_arr}
        theta_arr = {theta_arr}
        title = Text("{title}", font_size=30).to_edge(UP)
        pivot = Dot(UP * 2.5, color=WHITE)
        pivot_label = Text("Pivot", font_size=18, color=WHITE).next_to(pivot, UP, buff=0.15)
        mg_label = MathTex(r"mg", font_size=28, color=RED).to_corner(DR).shift(UP*1.5)
        t_label  = MathTex(r"T", font_size=28, color=GREEN).to_corner(DL).shift(UP*1.5)
        angle_label = MathTex(r"\\theta_0={round(_theta0_deg, 1)}^\\circ", font_size=26, color=ORANGE).to_corner(UR).shift(DOWN*0.8)
        eq = MathTex(r"\\ddot{{\\theta}} = -\\frac{{g}}{{L}}\\sin\\theta", font_size=26, color=WHITE).to_edge(DOWN)
        params_lbl = MathTex(r"L={_L}\\,m,\\;g={_g}\\,m/s^2", font_size=22, color=YELLOW).to_corner(UR).shift(DOWN*1.4)
        self.play(Write(title))
        self.play(FadeIn(pivot), Write(pivot_label), Write(mg_label), Write(t_label))
        self.play(Write(angle_label), Write(eq), Write(params_lbl))
        if theta_arr is not None:
            theta_vt = ValueTracker(theta_arr[0])
            rod  = always_redraw(lambda: Line(
                pivot.get_center(),
                pivot.get_center() + L_disp * np.array([math.sin(theta_vt.get_value()), -math.cos(theta_vt.get_value()), 0]),
                color=BLUE, stroke_width=4
            ))
            bob  = always_redraw(lambda: Circle(radius=0.22, color=YELLOW, fill_opacity=0.9).move_to(rod.get_end()))
            mg   = always_redraw(lambda: Arrow(rod.get_end(), rod.get_end()+DOWN*0.8, color=RED, buff=0, max_tip_length_to_length_ratio=0.2))
            ten  = always_redraw(lambda: Arrow(
                rod.get_end(),
                rod.get_end() + (pivot.get_center()-rod.get_end()) / max(np.linalg.norm(pivot.get_center()-rod.get_end()), 0.01) * 0.8,
                color=GREEN, buff=0, max_tip_length_to_length_ratio=0.2
            ))
            self.add(rod, bob, mg, ten)
            # Animate through pre-computed ODE trajectory using individual moves
            _n = len(theta_arr)
            _quarter = max(1, _n // 4)
            self.play(theta_vt.animate.set_value(theta_arr[_quarter]),   run_time=1.5, rate_func=linear)
            self.play(theta_vt.animate.set_value(theta_arr[2*_quarter]), run_time=1.5, rate_func=linear)
            self.play(theta_vt.animate.set_value(theta_arr[3*_quarter]), run_time=1.5, rate_func=linear)
            self.play(theta_vt.animate.set_value(theta_arr[-1]),         run_time=1.5, rate_func=linear)
        else:
            theta_vt = ValueTracker({round(_theta0, 3)})
            rod  = always_redraw(lambda: Line(pivot.get_center(), pivot.get_center()+L_disp*np.array([math.sin(theta_vt.get_value()),-math.cos(theta_vt.get_value()),0]), color=BLUE, stroke_width=4))
            bob  = always_redraw(lambda: Circle(radius=0.22, color=YELLOW, fill_opacity=0.9).move_to(rod.get_end()))
            self.add(rod, bob)
            for sgn in [1,-1,0.6,-0.5,0]:
                self.play(theta_vt.animate.set_value(sgn*{round(_theta0,3)}), run_time=1.0, rate_func=there_and_back if sgn==0 else linear)
        self.wait(1)"""
        return _get_manim_skeleton() + body

    # ── Circular motion / centripetal force ──────────────────────────────────
    if any(k in q for k in ("circular motion", "centripetal", "centrifugal",
                             "orbit", "revolv", "uniform circular")):
        import math as _math
        _r  = params.get("r", 2.0)
        _v  = params.get("v0", params.get("v", 3.0))
        _m  = params.get("m_mass", params.get("m", 1.0))
        _om = round(_v / _r, 3)
        _T  = round(2 * _math.pi * _r / _v, 3)
        _Fc = round(_m * _v ** 2 / _r, 3)
        body = f"""        import math
        r, v_speed, m_mass = {_r}, {_v}, {_m}
        omega = {_om}
        title = Text("{title}", font_size=28).to_edge(UP)
        circle = Circle(radius={min(_r, 2.5)}, color=BLUE, stroke_width=2)
        center_dot = Dot(ORIGIN, color=WHITE)
        center_lbl = Text("C", font_size=18, color=WHITE).next_to(center_dot, UR, buff=0.1)
        angle = ValueTracker(0)
        R_disp = {min(_r, 2.5)}
        ball = always_redraw(lambda: Dot(
            R_disp * np.array([math.cos(angle.get_value()), math.sin(angle.get_value()), 0]),
            color=RED, radius=0.18
        ))
        vel_arrow = always_redraw(lambda: Arrow(
            ball.get_center(),
            ball.get_center() + 0.8 * np.array([-math.sin(angle.get_value()), math.cos(angle.get_value()), 0]),
            color=GREEN, buff=0, max_tip_length_to_length_ratio=0.25
        ))
        cent_arrow = always_redraw(lambda: Arrow(
            ball.get_center(), ORIGIN,
            color=RED, buff=0.05, max_tip_length_to_length_ratio=0.2
        ))
        v_lbl  = MathTex(r"\\vec{{v}}", font_size=26, color=GREEN).to_corner(UR).shift(DOWN*0.9)
        Fc_lbl = MathTex(r"F_c = \\frac{{mv^2}}{{r}} = {_Fc}\\,N", font_size=24, color=RED).to_edge(DOWN)
        T_lbl  = MathTex(r"T = \\frac{{2\\pi r}}{{v}} = {_T}\\,s", font_size=22, color=YELLOW).to_corner(UR).shift(DOWN*1.5)
        om_lbl = MathTex(r"\\omega = v/r = {_om}\\,rad/s", font_size=22, color=ORANGE).to_corner(UR).shift(DOWN*2.1)
        self.play(Write(title))
        self.play(Create(circle), FadeIn(center_dot), Write(center_lbl))
        self.add(ball, vel_arrow, cent_arrow)
        self.play(Write(v_lbl), Write(Fc_lbl), Write(T_lbl), Write(om_lbl))
        self.play(angle.animate.set_value(2 * PI), run_time=_T if {_T} < 6 else 6, rate_func=linear)
        self.play(angle.animate.set_value(4 * PI), run_time=_T if {_T} < 6 else 6, rate_func=linear)
        self.wait(1)"""
        return _get_manim_skeleton() + body

    if any(k in q for k in ("wave", "interference", "sound", "light wave")):
        _A      = params.get("A", 1.2)
        _om     = params.get("omega", 1.2)
        _kw     = params.get("k_wave", 1.2)
        _t_end  = params.get("t_end", 10.0)
        _ymax   = max(2.0, _A * 1.3)
        _ymin   = -_ymax
        _cycles = max(1.0, _om * _t_end / (2 * 3.14159))  # approx cycles for animation
        _run    = max(2.0, min(8.0, _t_end * 0.6))
        body = f"""        A, omega, k_wave = {_A}, {_om}, {_kw}
        title = Text("{title}", font_size=28).to_edge(UP)
        axes = Axes(x_range=[0, 10, 1], y_range=[{_ymin:.1f}, {_ymax:.1f}, {max(1,int(_ymax/2))}], x_length=9, y_length=3.5).shift(DOWN * 0.5)
        phase = ValueTracker(0)
        eq = MathTex(r"y = A\\sin(kx - \\omega t)", font_size=30, color=WHITE).next_to(axes, UP)
        wave_params = MathTex(r"A={_A},\\;\\omega={_om},\\;k={_kw}", font_size=22, color=YELLOW).to_corner(DR).shift(UP * 0.3)
        amp_label = MathTex(r"A = {_A}", font_size=22, color=YELLOW).to_corner(UR).shift(DOWN * 0.5)
        wave = always_redraw(lambda: axes.plot(
            lambda x: A * np.sin(k_wave * x + phase.get_value()),
            x_range=[0, 10],
            color=BLUE
        ))

        self.play(Write(title))
        self.play(Create(axes))
        self.play(Write(eq), Write(amp_label), Write(wave_params))
        self.add(wave)
        self.play(phase.animate.set_value({round(_cycles * 2 * 3.14159, 2)}), run_time={round(_run, 1)}, rate_func=linear)
        self.wait(1)"""
        return _get_manim_skeleton() + body

    if any(k in q for k in ("force", "newton", "friction", "block")):
        _m_mass  = float(params.get("m_mass", 1.0))
        _F       = float(params.get("F", params.get("freq", 10.0)))
        _mu      = float(params.get("mu", 0.3))
        _g_acc   = float(params.get("g", 9.8))
        _f_fric  = round(_mu * _m_mass * _g_acc, 2)
        _a_acc   = round((_F - _f_fric) / _m_mass, 2) if _m_mass > 0 else 0
        _has_fric = _mu > 0.0

        # Conditional: friction arrows (always_redraw so they track block)
        if _has_fric:
            _fric_code = (
                f"        fr_arrow = always_redraw(lambda: Arrow(\n"
                f"            block.get_left(), block.get_left() + LEFT * 1.2,\n"
                f"            color=RED, buff=0, max_tip_length_to_length_ratio=0.2\n"
                f"        ))\n"
                f"        fr_label = MathTex(r\"f={{\\\\mu}}mg={_f_fric}\\\\,N\", font_size=20, color=RED)\n"
                f"        fr_label.add_updater(lambda m: m.next_to(fr_arrow, DOWN, buff=0.1))\n"
                f"        self.add(fr_arrow, fr_label)\n"
            )
            _mu_note_code = f"        mu_note = MathTex(r\"{{\\\\mu}}={_mu}\", font_size=20, color=ORANGE).to_corner(UR).shift(DOWN*2.0)\n"
            _eq_str = f"F_{{{{net}}}} = F - f = ma,\\\\quad a = {_a_acc}\\\\,m/s^2"
        else:
            _fric_code = ""
            _mu_note_code = f"        mu_note = Text(\"Frictionless (mu=0)\", font_size=18, color=GREEN_B).to_corner(UR).shift(DOWN*2.0)\n"
            _eq_str = f"F_{{{{net}}}} = F = ma,\\\\quad a = {_a_acc}\\\\,m/s^2"

        body = (
            f"        m_mass, F_applied, mu, g_acc = {_m_mass}, {_F}, {_mu}, {_g_acc}\n"
            f"        title = Text(\"{title}\", font_size=26).to_edge(UP)\n"
            f"        ground = Line(LEFT * 5.5 + DOWN * 1.8, RIGHT * 5.5 + DOWN * 1.8, color=GREY, stroke_width=2)\n"
            f"        block = Rectangle(width=1.8, height=1.0, color=BLUE, fill_opacity=0.6).move_to(LEFT * 2.5 + DOWN * 1.3)\n"
            # Labels compiled ONCE, repositioned each frame via add_updater (avoids per-frame LaTeX recompile)
            f"        block_lbl = MathTex(r\"m={_m_mass}\\\\,kg\", font_size=22, color=WHITE)\n"
            f"        block_lbl.add_updater(lambda m: m.move_to(block.get_center()))\n"
            # Arrows still use always_redraw (geometry must rebuild — cheap)
            f"        f_arrow = always_redraw(lambda: Arrow(\n"
            f"            block.get_right(), block.get_right() + RIGHT * 1.8,\n"
            f"            color=YELLOW, buff=0, max_tip_length_to_length_ratio=0.2\n"
            f"        ))\n"
            f"        f_label = MathTex(r\"F={_F}\\\\,N\", font_size=22, color=YELLOW)\n"
            f"        f_label.add_updater(lambda m: m.next_to(f_arrow, UP, buff=0.1))\n"
            f"        n_arrow = always_redraw(lambda: Arrow(\n"
            f"            block.get_top(), block.get_top() + UP * 1.1,\n"
            f"            color=GREEN, buff=0, max_tip_length_to_length_ratio=0.2\n"
            f"        ))\n"
            f"        n_label = MathTex(r\"N\", font_size=22, color=GREEN)\n"
            f"        n_label.add_updater(lambda m: m.next_to(n_arrow, RIGHT, buff=0.1))\n"
            f"        mg_arrow = always_redraw(lambda: Arrow(\n"
            f"            block.get_bottom(), block.get_bottom() + DOWN * 1.1,\n"
            f"            color=RED, buff=0, max_tip_length_to_length_ratio=0.2\n"
            f"        ))\n"
            f"        mg_label = MathTex(r\"mg\", font_size=22, color=RED)\n"
            f"        mg_label.add_updater(lambda m: m.next_to(mg_arrow, LEFT, buff=0.1))\n"
            + _mu_note_code
            + f"        eq = MathTex(r\"{_eq_str}\", font_size=22, color=WHITE).to_edge(DOWN).shift(UP*0.15)\n"
            f"        m_lbl = MathTex(r\"m={_m_mass}\\\\,kg,\\\\;F={_F}\\\\,N\", font_size=18, color=BLUE).to_corner(UR).shift(DOWN*0.8)\n"
            f"        a_lbl = MathTex(r\"a = {_a_acc}\\\\,m/s^2\", font_size=20, color=YELLOW).to_corner(UR).shift(DOWN*1.4)\n"
            f"        self.play(Write(title))\n"
            f"        self.play(Create(ground), FadeIn(block))\n"
            f"        self.add(block_lbl, n_arrow, n_label, mg_arrow, mg_label, f_arrow, f_label)\n"
            + _fric_code
            + f"        self.play(Write(mu_note), Write(m_lbl), Write(a_lbl), Write(eq))\n"
            f"        self.play(block.animate.shift(RIGHT * 4), run_time=1.8, rate_func=linear)\n"
            f"        self.wait(0.5)"
        )
        return _get_manim_skeleton() + body

    # ── Electric field / Coulomb / charge ───────────────────────────────────
    if any(k in q for k in ("electric field", "electric force", "coulomb", "charge",
                             "capacitor", "gauss", "electrostatic")):
        _q1 = params.get("q1", 1.0)
        _q2 = params.get("q2", -1.0)
        _c1_col = "RED" if _q1 > 0 else "BLUE"
        _c2_col = "BLUE" if _q2 < 0 else "RED"
        body = f"""        import math
        q1, q2 = {_q1}, {_q2}
        title = Text("{title}", font_size=28).to_edge(UP)
        c1 = Circle(radius=0.28, color={_c1_col}, fill_opacity=0.9).move_to(LEFT * 2)
        c2 = Circle(radius=0.28, color={_c2_col}, fill_opacity=0.9).move_to(RIGHT * 2)
        lbl1 = MathTex(r"+" if {_q1} > 0 else r"-", font_size=32, color=WHITE).move_to(c1)
        lbl2 = MathTex(r"+" if {_q2} > 0 else r"-", font_size=32, color=WHITE).move_to(c2)
        q1_lbl = MathTex(r"q_1 = {_q1}\\,C", font_size=22, color={_c1_col}).next_to(c1, DOWN, buff=0.25)
        q2_lbl = MathTex(r"q_2 = {_q2}\\,C", font_size=22, color={_c2_col}).next_to(c2, DOWN, buff=0.25)
        # Draw radial field arrows around each charge
        arrows = VGroup()
        for center, charge, col in [(LEFT*2, {_q1}, {_c1_col}), (RIGHT*2, {_q2}, {_c2_col})]:
            for ang_deg in range(0, 360, 45):
                ang = math.radians(ang_deg)
                dir_vec = np.array([math.cos(ang), math.sin(ang), 0])
                sign = 1 if charge > 0 else -1
                if charge > 0:
                    start = center + dir_vec * 0.35
                    end   = center + dir_vec * 0.95
                else:
                    start = center + dir_vec * 0.95
                    end   = center + dir_vec * 0.35
                arrows.add(Arrow(start, end, color=col, buff=0, max_tip_length_to_length_ratio=0.35, stroke_width=2))
        between = Arrow(c1.get_right(), c2.get_left(), color=YELLOW, buff=0.1, stroke_width=3)
        F_lbl   = MathTex(r"F = k\\frac{{q_1 q_2}}{{r^2}}", font_size=26, color=YELLOW).to_edge(DOWN)
        coulomb = MathTex(r"k = 8.99 \\times 10^9\\,N\\cdot m^2/C^2", font_size=22, color=WHITE).next_to(F_lbl, UP, buff=0.2)
        self.play(Write(title))
        self.play(FadeIn(c1), FadeIn(c2), Write(lbl1), Write(lbl2))
        self.play(Write(q1_lbl), Write(q2_lbl))
        self.play(Create(arrows), run_time=1.5)
        self.play(Create(between))
        self.play(Write(F_lbl), Write(coulomb))
        self.wait(0.5)"""
        return _get_manim_skeleton() + body

    # ── Magnetic field / Lorentz force ───────────────────────────────────────
    if any(k in q for k in ("magnetic field", "magnetic force", "lorentz", "ampere",
                             "biot-savart", "solenoid", "electromagnet", "faraday")):
        body = f"""        import math
        title = Text("{title}", font_size=28).to_edge(UP)
        wire = Line(DOWN * 2.5, UP * 2.5, color=ORANGE, stroke_width=6).move_to(ORIGIN)
        wire_lbl = Text("Current I", font_size=20, color=ORANGE).next_to(wire, RIGHT, buff=0.2)
        i_arrow = Arrow(DOWN * 2.2, UP * 2.2, color=ORANGE, buff=0).next_to(wire, RIGHT, buff=0.05)
        # Concentric circular B-field lines
        b_circles = VGroup(*[Circle(radius=r, color=BLUE, stroke_width=2, stroke_opacity=0.7+0.3/r)
                              for r in [0.6, 1.1, 1.7]])
        # Arrows on B-field circles (CCW = right-hand rule with current up)
        b_arrows = VGroup()
        for r in [0.6, 1.1, 1.7]:
            ang = PI / 4
            pos = r * np.array([math.cos(ang), math.sin(ang), 0])
            tang = r * np.array([-math.sin(ang), math.cos(ang), 0]) * 0.4
            b_arrows.add(Arrow(pos, pos + tang / r, color=BLUE, buff=0, max_tip_length_to_length_ratio=0.4, stroke_width=2))
        eq_B  = MathTex(r"B = \\frac{{\\mu_0 I}}{{2\\pi r}}", font_size=28, color=BLUE).to_corner(UR).shift(DOWN*0.8)
        eq_F  = MathTex(r"\\vec{{F}} = q\\vec{{v}} \\times \\vec{{B}}", font_size=26, color=RED).to_edge(DOWN)
        mu_lbl = MathTex(r"\\mu_0 = 4\\pi \\times 10^{{-7}}\\,T\\cdot m/A", font_size=20, color=WHITE).next_to(eq_F, UP, buff=0.2)
        self.play(Write(title))
        self.play(Create(wire), Write(wire_lbl), Create(i_arrow))
        self.play(Create(b_circles), run_time=1.5)
        self.play(Create(b_arrows))
        self.play(Write(eq_B), Write(eq_F), Write(mu_lbl))
        self.wait(0.5)"""
        return _get_manim_skeleton() + body

    # ── Optics: Snell's law / refraction / reflection ────────────────────────
    if any(k in q for k in ("optic", "refract", "reflect", "snell", "lens",
                             "light ray", "total internal", "diffract")):
        _n1 = params.get("n1", 1.0)
        _n2 = params.get("n2", 1.5)
        import math as _math
        _theta_i_deg = params.get("theta0", params.get("theta_i", 45.0))
        _theta_i = _math.radians(_theta_i_deg)
        _sin_r = _n1 * _math.sin(_theta_i) / _n2
        _theta_r_deg = round(_math.degrees(_math.asin(min(_sin_r, 1.0))), 1)
        body = f"""        import math
        n1, n2 = {_n1}, {_n2}
        theta_i_deg = {_theta_i_deg}
        theta_r_deg = {_theta_r_deg}
        title = Text("{title}", font_size=28).to_edge(UP)
        # Interface line
        interface = Line(LEFT * 5, RIGHT * 5, color=GREY, stroke_width=2).shift(DOWN * 0.0)
        medium1_lbl = Text(f"Medium 1  n₁ = {_n1}", font_size=22, color=BLUE).move_to(UP * 1.8 + LEFT * 3)
        medium2_lbl = Text(f"Medium 2  n₂ = {_n2}", font_size=22, color=RED).move_to(DOWN * 1.8 + LEFT * 3)
        # Normal line
        normal = DashedLine(UP * 2.5, DOWN * 2.5, color=WHITE, stroke_width=1.5)
        # Incident ray (from upper-left to origin)
        ti = math.radians(theta_i_deg)
        incident = Arrow(UP*2.2*math.cos(ti)+LEFT*2.2*math.sin(ti), ORIGIN, color=YELLOW, buff=0, stroke_width=4)
        # Reflected ray
        reflected = Arrow(ORIGIN, UP*1.8*math.cos(ti)+RIGHT*1.8*math.sin(ti), color=YELLOW_A, buff=0, stroke_width=3)
        # Refracted ray
        tr = math.radians(theta_r_deg)
        refracted = Arrow(ORIGIN, DOWN*1.8*math.cos(tr)+RIGHT*1.8*math.sin(tr), color=GREEN, buff=0, stroke_width=4)
        # Angle arcs and labels
        arc_i = Arc(radius=0.7, start_angle=PI/2, angle=-ti, arc_center=ORIGIN, color=YELLOW)
        arc_r_ref = Arc(radius=0.55, start_angle=PI/2, angle=ti, arc_center=ORIGIN, color=YELLOW_A)
        arc_refrac = Arc(radius=0.7, start_angle=-PI/2, angle=tr, arc_center=ORIGIN, color=GREEN)
        lbl_ti = MathTex(r"\\theta_i = {_theta_i_deg}^\\circ", font_size=22, color=YELLOW).move_to(UP*0.85+LEFT*0.6)
        lbl_tr = MathTex(r"\\theta_r = {_theta_r_deg}^\\circ", font_size=22, color=GREEN).move_to(DOWN*0.9+RIGHT*0.55)
        snell_eq = MathTex(r"n_1 \\sin\\theta_i = n_2 \\sin\\theta_r", font_size=26, color=WHITE).to_edge(DOWN)
        snell_vals = MathTex(r"{_n1}\\cdot\\sin({_theta_i_deg}^\\circ) = {_n2}\\cdot\\sin({_theta_r_deg}^\\circ)", font_size=22, color=YELLOW).next_to(snell_eq, UP, buff=0.2)
        self.play(Write(title))
        self.play(Create(interface), Write(medium1_lbl), Write(medium2_lbl))
        self.play(Create(normal))
        self.play(Create(incident))
        self.play(Create(arc_i), Write(lbl_ti))
        self.play(Create(reflected), Create(arc_r_ref))
        self.play(Create(refracted), Create(arc_refrac), Write(lbl_tr))
        self.play(Write(snell_eq), Write(snell_vals))
        self.wait(0.5)"""
        return _get_manim_skeleton() + body

    # ── Free fall ─────────────────────────────────────────────────────────────
    if any(k in q for k in ("free fall", "freefall", "falling body", "falling object",
                             "falling ball", "dropped from", "drop from", "ball drop",
                             "object drop", "free-fall")):
        import math as _math
        _g  = params.get("g", 9.8)
        _h  = params.get("h", params.get("H", 5.0))
        _t_fall   = round(_math.sqrt(2 * _h / _g), 2) if _g > 0 else 1.0
        _v_final  = round(_g * _t_fall, 1)
        body = f"""        import math
        g_val  = {_g}
        h_val  = {_h}
        t_fall = {_t_fall}
        title = Text("{title}", font_size=28).to_edge(UP)
        ground = Line(LEFT * 4.5, RIGHT * 4.5, color=GREY, stroke_width=3).shift(DOWN * 2.8)
        ground_lbl = Text("Ground (h = 0)", font_size=18, color=GREY).next_to(ground, DOWN, buff=0.1)
        start_line = DashedLine(LEFT * 0.6, RIGHT * 0.6, color=YELLOW, stroke_width=1.5).shift(UP * 2.5)
        h_brace_lbl = MathTex(r"h = {_h}\\,m", font_size=22, color=YELLOW).shift(LEFT * 1.8 + UP * 0.5)
        t = ValueTracker(0)
        ball = always_redraw(lambda: Dot(
            UP * (2.5 - 0.5 * g_val * min(t.get_value(), t_fall) ** 2),
            color=BLUE, radius=0.2
        ))
        vel_arrow = always_redraw(lambda: Arrow(
            ball.get_center(),
            ball.get_center() + DOWN * min(g_val * t.get_value() * 0.2, 2.5),
            color=GREEN, buff=0, stroke_width=3.5,
            max_tip_length_to_length_ratio=0.22
        ) if t.get_value() > 0.05 else VGroup())
        vel_lbl = always_redraw(lambda: MathTex(
            r"v = " + f"{g_val * min(t.get_value(), t_fall):.1f}" + r"\\;m/s",
            font_size=22, color=GREEN
        ).to_corner(UL).shift(DOWN * 0.5 + RIGHT * 0.2))
        pos_lbl = always_redraw(lambda: MathTex(
            r"y = " + f"{0.5 * g_val * min(t.get_value(), t_fall) ** 2:.2f}" + r"\\;m",
            font_size=22, color=YELLOW
        ).to_corner(UL).shift(DOWN * 1.1 + RIGHT * 0.2))
        eq_v   = MathTex(r"v = g\\,t", font_size=28, color=GREEN).to_corner(UR).shift(DOWN * 0.7 + LEFT * 0.2)
        eq_y   = MathTex(r"y = \\tfrac{{1}}{{2}}g\\,t^2", font_size=28, color=YELLOW).to_corner(UR).shift(DOWN * 1.45 + LEFT * 0.2)
        eq_g   = MathTex(r"g = {_g}\\;m/s^2", font_size=24, color=RED).to_corner(UR).shift(DOWN * 2.2 + LEFT * 0.2)
        g_arrow = Arrow(UP * 0.6 + RIGHT * 2.5, DOWN * 0.3 + RIGHT * 2.5, color=RED, buff=0, stroke_width=3)
        g_label = MathTex(r"g", font_size=26, color=RED).next_to(g_arrow, RIGHT, buff=0.12)
        self.play(Write(title))
        self.play(Create(ground), Write(ground_lbl))
        self.play(Create(start_line), Write(h_brace_lbl))
        self.play(FadeIn(ball))
        self.play(Write(eq_v), Write(eq_y), Write(eq_g))
        self.play(Create(g_arrow), Write(g_label))
        self.add(vel_arrow, vel_lbl, pos_lbl)
        self.play(t.animate.set_value(t_fall), run_time=3.5, rate_func=linear)
        self.wait(1.0)"""
        return _get_manim_skeleton() + body

    # ── Gravity / Kepler / orbital mechanics ─────────────────────────────────
    if any(k in q for k in ("gravity", "gravitational", "kepler", "orbital",
                             "escape velocity", "newton's law of gravitation", "satellite")):
        _M = params.get("M", 5.97e24)
        _m = params.get("m_mass", 1000.0)
        _r = params.get("r", 6.4e6 + 4e5)
        import math as _math
        _G = 6.674e-11
        _v_orb = round(_math.sqrt(_G * _M / _r), 1) if _M > 0 and _r > 0 else 7784
        _v_esc = round(_math.sqrt(2 * _G * _M / _r), 1) if _M > 0 and _r > 0 else 11186
        body = f"""        import math
        title = Text("{title}", font_size=28).to_edge(UP)
        planet = Circle(radius=0.7, color=BLUE, fill_opacity=0.85).move_to(ORIGIN)
        planet_lbl = Text("M", font_size=24, color=WHITE).move_to(planet.get_center())
        orbit = Circle(radius=2.2, color=GREY, stroke_width=1.5, stroke_opacity=0.5)
        satellite = Dot(RIGHT * 2.2, color=YELLOW, radius=0.13)
        sat_lbl = Text("m", font_size=18, color=YELLOW).next_to(satellite, UR, buff=0.05)
        angle = ValueTracker(0)
        satellite = always_redraw(lambda: Dot(
            2.2 * np.array([math.cos(angle.get_value()), math.sin(angle.get_value()), 0]),
            color=YELLOW, radius=0.13
        ))
        grav_arrow = always_redraw(lambda: Arrow(
            satellite.get_center(), ORIGIN,
            color=RED, buff=0.08, max_tip_length_to_length_ratio=0.2, stroke_width=2.5
        ))
        vel_arrow = always_redraw(lambda: Arrow(
            satellite.get_center(),
            satellite.get_center() + 0.7 * np.array([-math.sin(angle.get_value()), math.cos(angle.get_value()), 0]),
            color=GREEN, buff=0, max_tip_length_to_length_ratio=0.25, stroke_width=2.5
        ))
        eq_g  = MathTex(r"F = \\frac{{GMm}}{{r^2}}", font_size=26, color=RED).to_corner(UR).shift(DOWN*0.8)
        eq_v  = MathTex(r"v_{{orb}} = \\sqrt{{GM/r}} \\approx {_v_orb:.0f}\\,m/s", font_size=22, color=GREEN).to_corner(UR).shift(DOWN*1.4)
        eq_esc = MathTex(r"v_{{esc}} = \\sqrt{{2GM/r}} \\approx {_v_esc:.0f}\\,m/s", font_size=22, color=YELLOW).to_corner(UR).shift(DOWN*2.0)
        self.play(Write(title))
        self.play(FadeIn(planet), Write(planet_lbl), Create(orbit))
        self.add(satellite, grav_arrow, vel_arrow)
        self.play(Write(eq_g), Write(eq_v), Write(eq_esc))
        self.play(angle.animate.set_value(2 * PI), run_time=3.5, rate_func=linear)
        self.play(angle.animate.set_value(4 * PI), run_time=3.5, rate_func=linear)
        self.wait(0.5)"""
        return _get_manim_skeleton() + body

    # ── Thermodynamics / ideal gas / kinetic theory ──────────────────────────
    if any(k in q for k in ("thermo", "ideal gas", "kinetic theory", "entropy",
                             "carnot", "heat", "temperature", "pressure", "pv diagram",
                             "boltzmann", "gas law")):
        _T_K = params.get("T", 300.0)
        _P   = params.get("P", 1.0)
        _V   = params.get("V", 1.0)
        _n   = params.get("n", 1.0)
        _R   = 8.314
        body = f"""        import math, random
        random.seed(42)
        T_temp, P_press, V_vol, n_mol = {_T_K}, {_P}, {_V}, {_n}
        title = Text("{title}", font_size=28).to_edge(UP)
        container = Rectangle(width=4, height=3, color=WHITE, stroke_width=3).shift(LEFT * 2)
        # Gas particles
        n_particles = 14
        particles = [Dot(
            container.get_left() + RIGHT * (0.4 + random.random() * 3.2) + UP * (-1.3 + random.random() * 2.6),
            radius=0.1, color=BLUE_B
        ) for _ in range(n_particles)]
        vels = [[random.uniform(-0.8, 0.8), random.uniform(-0.8, 0.8)] for _ in range(n_particles)]
        pv_axes = Axes(x_range=[0, 3, 1], y_range=[0, 3, 1], x_length=3.5, y_length=2.5).to_corner(UR).shift(LEFT*0.3+DOWN*0.5)
        pv_labels = pv_axes.get_axis_labels(MathTex("V"), MathTex("P"))
        isotherm = pv_axes.plot(lambda v: 1/v if v > 0.01 else 3, x_range=[0.4, 2.8], color=YELLOW, stroke_width=2)
        eq_pv = MathTex(r"PV = nRT", font_size=28, color=WHITE).to_corner(UR).shift(DOWN*3.2+LEFT*0.2)
        vals  = MathTex(r"n={_n}\\,mol,\\;T={_T_K}\\,K", font_size=22, color=YELLOW).to_corner(UR).shift(DOWN*3.8+LEFT*0.2)
        eq_ke = MathTex(r"\\bar{{E}}_{{kin}} = \\frac{{3}}{{2}} k_B T", font_size=22, color=GREEN).to_corner(UR).shift(DOWN*4.4+LEFT*0.2)
        self.play(Write(title))
        self.play(Create(container))
        self.play(*[FadeIn(p) for p in particles])
        self.play(Create(pv_axes), Write(pv_labels), Create(isotherm))
        self.play(Write(eq_pv), Write(vals), Write(eq_ke))
        # Animate particles bouncing
        left_x  = container.get_left()[0]  + 0.15
        right_x = container.get_right()[0] - 0.15
        top_y   = container.get_top()[1]   - 0.15
        bot_y   = container.get_bottom()[1]+ 0.15
        for _ in range(48):
            anims = []
            for i, p in enumerate(particles):
                nx = p.get_center()[0] + vels[i][0] * 0.18
                ny = p.get_center()[1] + vels[i][1] * 0.18
                if nx < left_x or nx > right_x: vels[i][0] *= -1; nx = p.get_center()[0]
                if ny < bot_y  or ny > top_y:   vels[i][1] *= -1; ny = p.get_center()[1]
                anims.append(p.animate.move_to([nx, ny, 0]))
            self.play(*anims, run_time=0.12, rate_func=linear)
        self.wait(1)"""
        return _get_manim_skeleton() + body

    # ── Fluid / Buoyancy / Archimedes ───────────────────────────────────────
    if any(k in q for k in ("buoyan", "archimedes", "fluid", "bernoulli",
                             "hydrostatic", "floati", "submerge", "density fluid")):
        import math as _math
        _rho_f  = params.get("rho", params.get("rho_f", 1000.0))
        _rho_obj = params.get("rho_obj", params.get("rho_s", 500.0))
        _V_vol  = params.get("V", 0.001)
        _g      = params.get("g", 9.8)
        _Fb     = round(_rho_f * _V_vol * _g, 2)
        _W      = round(_rho_obj * _V_vol * _g, 2)
        _net_col = "GREEN" if _Fb > _W else ("RED" if _Fb < _W else "YELLOW")
        _net_lbl = "Rises" if _Fb > _W else ("Sinks" if _Fb < _W else "Neutral")
        body = f"""        import math
        rho_fluid, rho_obj, V_vol, g_acc = {_rho_f}, {_rho_obj}, {_V_vol}, {_g}
        F_b = rho_fluid * V_vol * g_acc
        W   = rho_obj   * V_vol * g_acc
        title = Text("{title}", font_size=28).to_edge(UP)
        fluid_rect = Rectangle(width=6, height=3, color=BLUE_E, fill_opacity=0.3, stroke_width=2).shift(DOWN * 0.5)
        fluid_lbl  = MathTex(r"\\rho_f = {_rho_f}\\,kg/m^3", font_size=22, color=BLUE).next_to(fluid_rect, DOWN, buff=0.1)
        obj = Square(side_length=0.9, color=ORANGE, fill_opacity=0.85).move_to(ORIGIN + DOWN * 0.3)
        obj_lbl = MathTex(r"\\rho_s = {_rho_obj}\\,kg/m^3", font_size=20, color=ORANGE).next_to(obj, RIGHT, buff=0.15)
        fb_arrow  = Arrow(obj.get_bottom(), obj.get_bottom() + UP * 1.5, color=GREEN, buff=0, max_tip_length_to_length_ratio=0.25)
        fb_lbl    = MathTex(r"F_b = \\rho_f V g = {_Fb}\\,N", font_size=22, color=GREEN).next_to(fb_arrow, LEFT, buff=0.1)
        w_arrow   = Arrow(obj.get_top(), obj.get_top() + DOWN * 1.2, color=RED, buff=0, max_tip_length_to_length_ratio=0.25)
        w_lbl     = MathTex(r"W = {_W}\\,N", font_size=22, color=RED).next_to(w_arrow, RIGHT, buff=0.1)
        net_lbl   = MathTex(r"F_{{net}} = {round(_Fb - _W, 2)}\\,N \\Rightarrow \\text{{{_net_lbl}}}", font_size=24, color={_net_col}).to_edge(DOWN).shift(UP*0.2)
        arch_eq   = MathTex(r"F_b = \\rho_f V g", font_size=26, color=WHITE).to_corner(UR).shift(DOWN * 0.8)
        self.play(Write(title))
        self.play(Create(fluid_rect), Write(fluid_lbl))
        self.play(FadeIn(obj), Write(obj_lbl))
        self.play(Create(fb_arrow), Write(fb_lbl))
        self.play(Create(w_arrow), Write(w_lbl))
        self.play(Write(arch_eq), Write(net_lbl))
        self.wait(0.5)"""
        return _get_manim_skeleton() + body

    # ── Rotational mechanics / Torque / Angular momentum ─────────────────────
    if any(k in q for k in ("torque", "moment of inertia", "angular momentum",
                             "angular velocity", "rotational", "spinning", "gyroscop", "rolling down")):
        import math as _math
        _I   = params.get("I", 2.0)
        _om  = params.get("omega", 3.0)
        _F   = params.get("F", params.get("force", 5.0))
        _r   = params.get("r", 1.5)
        _tau = round(_F * _r, 3)
        _L   = round(_I * _om, 3)
        _KE  = round(0.5 * _I * _om ** 2, 3)
        body = f"""        import math
        I_val, omega, F_force, r_arm = {_I}, {_om}, {_F}, {_r}
        tau = F_force * r_arm
        L   = I_val * omega
        title = Text("{title}", font_size=28).to_edge(UP)
        disk  = Circle(radius=1.6, color=BLUE, fill_opacity=0.25, stroke_width=4)
        axle  = Dot(ORIGIN, color=WHITE, radius=0.12)
        angle = ValueTracker(0)
        spoke = always_redraw(lambda: Line(
            ORIGIN,
            1.6 * np.array([math.cos(angle.get_value()), math.sin(angle.get_value()), 0]),
            color=BLUE_B, stroke_width=3
        ))
        dot_on_rim = always_redraw(lambda: Dot(
            1.6 * np.array([math.cos(angle.get_value()), math.sin(angle.get_value()), 0]),
            color=YELLOW, radius=0.14
        ))
        torque_arrow = Arrow(disk.get_bottom(), disk.get_bottom() + RIGHT * 1.8, color=RED, buff=0)
        torque_lbl = MathTex(r"\\tau = Fr = {_tau}\\,N\\cdot m", font_size=24, color=RED).next_to(torque_arrow, DOWN, buff=0.1)
        I_lbl  = MathTex(r"I = {_I}\\,kg\\cdot m^2", font_size=22, color=BLUE).to_corner(UR).shift(DOWN*0.8)
        om_lbl = MathTex(r"\\omega = {_om}\\,rad/s", font_size=22, color=GREEN).to_corner(UR).shift(DOWN*1.4)
        L_lbl  = MathTex(r"L = I\\omega = {_L}\\,kg\\cdot m^2/s", font_size=22, color=ORANGE).to_corner(UR).shift(DOWN*2.0)
        KE_lbl = MathTex(r"KE = \\frac{{1}}{{2}}I\\omega^2 = {_KE}\\,J", font_size=22, color=YELLOW).to_corner(UR).shift(DOWN*2.6)
        alpha_eq = MathTex(r"\\alpha = \\tau / I", font_size=26, color=WHITE).to_edge(DOWN).shift(UP*0.2)
        self.play(Write(title))
        self.play(Create(disk), FadeIn(axle))
        self.add(spoke, dot_on_rim)
        self.play(Write(I_lbl), Write(om_lbl), Write(L_lbl), Write(KE_lbl))
        self.play(Create(torque_arrow), Write(torque_lbl), Write(alpha_eq))
        self.play(angle.animate.set_value(2 * PI), run_time=2 * PI / {max(_om, 0.1):.2f}, rate_func=linear)
        self.play(angle.animate.set_value(4 * PI), run_time=2 * PI / {max(_om, 0.1):.2f}, rate_func=linear)
        self.wait(1)"""
        return _get_manim_skeleton() + body

    # ── Electric circuit / RC / Ohm's law ────────────────────────────────────
    if any(k in q for k in ("circuit", "ohm", "kirchhoff", "rc circuit", "rlc",
                             "resistor", "capacitor", "inductor", "voltage divider")):
        import math as _math
        _R   = params.get("R", 1000.0)
        _C   = params.get("C", 0.001)
        _V0  = params.get("V", params.get("V0", 5.0))
        _tau = round(_R * _C, 4)
        _n_pts = 60
        _t_end = 5 * _tau if _tau > 0 else 1.0
        t_pts  = [i * _t_end / _n_pts for i in range(_n_pts + 1)]
        vc_pts = [round(_V0 * (1 - _math.exp(-t / max(_tau, 1e-9))), 4) for t in t_pts]
        body = f"""        import math
        R, C, V0 = {_R}, {_C}, {_V0}
        tau_rc = R * C
        t_data  = {t_pts}
        vc_data = {vc_pts}
        title = Text("{title}", font_size=28).to_edge(UP)
        axes = Axes(
            x_range=[0, {round(_t_end, 3)}, {round(_t_end/5, 3)}],
            y_range=[0, {round(_V0 * 1.1, 2)}, {round(_V0 / 5, 2)}],
            x_length=7, y_length=3.5
        ).shift(DOWN * 0.3)
        x_lbl = axes.get_x_axis_label(MathTex("t\\,(s)"))
        y_lbl = axes.get_y_axis_label(MathTex("V_C\\,(V)"))
        curve = axes.plot_line_graph(x_values=t_data, y_values=vc_data, line_color=GREEN, stroke_width=3, add_vertex_dots=False)
        asym  = DashedLine(axes.c2p(0, V0), axes.c2p({round(_t_end, 3)}, V0), color=YELLOW, stroke_width=1.5)
        asym_lbl = MathTex(r"V_0 = {_V0}\\,V", font_size=20, color=YELLOW).next_to(asym, RIGHT, buff=0.1)
        tau_line  = DashedLine(axes.c2p(tau_rc, 0), axes.c2p(tau_rc, V0 * 0.632), color=ORANGE, stroke_width=1.5)
        tau_lbl   = MathTex(r"\\tau = RC = {_tau}\\,s", font_size=22, color=ORANGE).to_corner(UR).shift(DOWN*0.8)
        eq_charge = MathTex(r"V_C(t) = V_0(1 - e^{{-t/\\tau}})", font_size=26, color=WHITE).to_edge(DOWN).shift(UP*0.2)
        R_lbl     = MathTex(r"R={_R}\\,\\Omega,\\;C={_C}\\,F", font_size=22, color=BLUE).to_corner(UR).shift(DOWN*1.4)
        self.play(Write(title))
        self.play(Create(axes), Write(x_lbl), Write(y_lbl))
        self.play(Create(curve, run_time=2))
        self.play(Create(asym), Write(asym_lbl))
        self.play(Create(tau_line), Write(tau_lbl))
        self.play(Write(eq_charge), Write(R_lbl))
        self.wait(0.5)"""
        return _get_manim_skeleton() + body

    # ── Doppler effect / moving source ───────────────────────────────────────
    if any(k in q for k in ("doppler", "doppler effect", "frequency shift",
                             "moving source", "beats frequency", "resonance harmonic")):
        import math as _math
        _f   = params.get("freq", params.get("f", 440.0))
        _vs  = params.get("vs", params.get("v_source", 30.0))
        _v   = params.get("v_sound", params.get("v", 343.0))
        _f_ahead  = round(_f * _v / (_v - _vs), 1) if _v > _vs else _f * 3
        _f_behind = round(_f * _v / (_v + _vs), 1)
        body = f"""        import math
        f0, vs, v_sound = {_f}, {_vs}, {_v}
        f_ahead  = {_f_ahead}
        f_behind = {_f_behind}
        title = Text("{title}", font_size=28).to_edge(UP)
        # Moving source dot
        source = Dot(LEFT * 3.5, color=ORANGE, radius=0.22)
        src_lbl = Text("Source", font_size=18, color=ORANGE).next_to(source, DOWN, buff=0.1)
        v_arrow = Arrow(source.get_center(), source.get_center() + RIGHT * 1.2, color=GREEN, buff=0, max_tip_length_to_length_ratio=0.3)
        # Draw concentric wave circles (compressed ahead, stretched behind)
        waves = VGroup()
        for i, r in enumerate([0.5, 1.0, 1.5, 2.0]):
            x_offset = i * 0.3  # shift centres ahead (compression)
            c = Circle(radius=r, color=BLUE, stroke_width=1.5, stroke_opacity=0.8).shift(LEFT * 3.5 + RIGHT * x_offset)
            waves.add(c)
        observer_ahead  = Dot(RIGHT * 2.5, color=GREEN, radius=0.18)
        observer_behind = Dot(LEFT * 6.5 if LEFT * 6.5 is not None else LEFT * 4.5, color=RED, radius=0.18)
        obs_a_lbl = Text("Observer", font_size=16, color=GREEN).next_to(observer_ahead, UP, buff=0.1)
        f_eq = MathTex(r"f' = f_0 \\frac{{v}}{{v \\mp v_s}}", font_size=26, color=WHITE).to_edge(DOWN).shift(UP*0.2)
        f_ahead_lbl  = MathTex(r"f'_{{ahead}} = {_f_ahead}\\,Hz", font_size=22, color=GREEN).to_corner(UR).shift(DOWN*0.8)
        f_behind_lbl = MathTex(r"f'_{{behind}} = {_f_behind}\\,Hz", font_size=22, color=RED).to_corner(UR).shift(DOWN*1.4)
        f0_lbl       = MathTex(r"f_0 = {_f}\\,Hz,\\;v_s = {_vs}\\,m/s", font_size=20, color=ORANGE).to_corner(UR).shift(DOWN*2.0)
        self.play(Write(title))
        self.play(FadeIn(source), Write(src_lbl), Create(v_arrow))
        self.play(Create(waves, run_time=2))
        self.play(FadeIn(observer_ahead), Write(obs_a_lbl))
        self.play(Write(f_eq), Write(f_ahead_lbl), Write(f_behind_lbl), Write(f0_lbl))
        self.play(source.animate.shift(RIGHT * 4), v_arrow.animate.shift(RIGHT * 4), run_time=2.5, rate_func=linear)
        self.wait(1)"""
        return _get_manim_skeleton() + body

    # ── Quantum mechanics / particle in a box / wave function ─────────────────
    if any(k in q for k in ("quantum", "wave function", "schrodinger", "uncertainty principle",
                             "de broglie", "photoelectric", "heisenberg", "particle in a box")):
        import math as _math
        _n   = max(1, int(params.get("n", 1)))
        _L   = params.get("L", 1.0)
        _x_pts = [round(i * _L / 100, 4) for i in range(101)]
        _psi  = [round(_math.sin(_n * _math.pi * x / _L), 4) for x in _x_pts]
        _psi2 = [round(v ** 2, 4) for v in _psi]
        _E_n  = round(_n ** 2 * (_math.pi ** 2) / (2 * _L ** 2), 4)  # in units of ħ²/m
        body = f"""        import math
        n, L = {_n}, {_L}
        x_data   = {_x_pts}
        psi_data = {_psi}
        psi2_data = {_psi2}
        title = Text("{title}", font_size=28).to_edge(UP)
        axes = Axes(x_range=[0, {_L}, {round(_L/4, 2)}], y_range=[-1.3, 1.3, 0.5], x_length=7, y_length=3).shift(DOWN * 0.2)
        x_lbl = axes.get_x_axis_label(MathTex("x"))
        y_lbl = axes.get_y_axis_label(MathTex("\\\\psi(x)"))
        wall_left  = Line(axes.c2p(0, -1.3), axes.c2p(0, 1.3), color=GREY, stroke_width=5)
        wall_right = Line(axes.c2p({_L}, -1.3), axes.c2p({_L}, 1.3), color=GREY, stroke_width=5)
        psi_curve  = axes.plot_line_graph(x_values=x_data, y_values=psi_data, line_color=BLUE, stroke_width=3, add_vertex_dots=False)
        psi2_curve = axes.plot_line_graph(x_values=x_data, y_values=psi2_data, line_color=YELLOW, stroke_width=2, add_vertex_dots=False)
        psi_lbl    = MathTex(r"\\psi_n(x) = A\\sin\\!\\left(\\frac{{n\\pi x}}{{L}}\\right)", font_size=22, color=BLUE).to_corner(UR).shift(DOWN*0.8)
        E_lbl      = MathTex(r"E_n = \\frac{{n^2 \\pi^2 \\hbar^2}}{{2mL^2}},\\;n={_n}", font_size=22, color=GREEN).to_corner(UR).shift(DOWN*1.5)
        uncert_lbl = MathTex(r"\\Delta x \\cdot \\Delta p \\geq \\frac{{\\hbar}}{{2}}", font_size=22, color=ORANGE).to_edge(DOWN).shift(UP*0.2)
        prob_lbl   = Text("|ψ|² = Probability density", font_size=18, color=YELLOW).to_corner(UR).shift(DOWN*2.2)
        self.play(Write(title))
        self.play(Create(axes), Write(x_lbl), Write(y_lbl))
        self.play(Create(wall_left), Create(wall_right))
        self.play(Create(psi_curve, run_time=2))
        self.play(Create(psi2_curve, run_time=1.5))
        self.play(Write(psi_lbl), Write(E_lbl))
        self.play(Write(uncert_lbl), Write(prob_lbl))
        self.wait(0.5)"""
        return _get_manim_skeleton() + body

    # ── Nuclear / Radioactive decay ───────────────────────────────────────────
    if any(k in q for k in ("nuclear", "radioactive", "radioactivity",
                             "half-life", "fission", "fusion", "decay constant")):
        import math as _math
        _t_half = params.get("t", params.get("t_half", 5.0))
        _N0     = params.get("N0", params.get("n", 1000.0))
        _lam    = round(_math.log(2) / _t_half, 4)
        _t_end  = 5 * _t_half
        _t_pts  = [round(i * _t_end / 60, 3) for i in range(61)]
        _N_pts  = [round(_N0 * _math.exp(-_lam * t), 1) for t in _t_pts]
        _t_half_N = round(_N0 / 2, 1)
        body = f"""        import math
        t_half, N0, lam = {_t_half}, {_N0}, {_lam}
        t_data = {_t_pts}
        N_data = {_N_pts}
        title = Text("{title}", font_size=28).to_edge(UP)
        axes = Axes(
            x_range=[0, {round(_t_end, 2)}, {round(_t_half, 2)}],
            y_range=[0, {round(_N0 * 1.1, 0)}, {round(_N0 / 4, 0)}],
            x_length=7, y_length=3.5
        ).shift(DOWN * 0.2)
        x_lbl = axes.get_x_axis_label(MathTex("t"))
        y_lbl = axes.get_y_axis_label(MathTex("N(t)"))
        decay_curve = axes.plot_line_graph(x_values=t_data, y_values=N_data, line_color=ORANGE, stroke_width=3, add_vertex_dots=False)
        half_h = DashedLine(axes.c2p(0, {_t_half_N}), axes.c2p({_t_half}, {_t_half_N}), color=YELLOW, stroke_width=1.5)
        half_v = DashedLine(axes.c2p({_t_half}, 0), axes.c2p({_t_half}, {_t_half_N}), color=YELLOW, stroke_width=1.5)
        half_lbl  = MathTex(r"t_{{1/2}} = {_t_half}", font_size=20, color=YELLOW).next_to(axes.c2p({_t_half}, 0), DOWN, buff=0.15)
        eq_decay  = MathTex(r"N(t) = N_0 e^{{-\\lambda t}}", font_size=26, color=WHITE).to_edge(DOWN).shift(UP*0.2)
        lam_lbl   = MathTex(r"\\lambda = \\ln 2 / t_{{1/2}} = {_lam}", font_size=22, color=ORANGE).to_corner(UR).shift(DOWN*0.8)
        N0_lbl    = MathTex(r"N_0 = {int(_N0)}", font_size=22, color=GREEN).to_corner(UR).shift(DOWN*1.4)
        self.play(Write(title))
        self.play(Create(axes), Write(x_lbl), Write(y_lbl))
        self.play(Create(decay_curve, run_time=2))
        self.play(Create(half_h), Create(half_v), Write(half_lbl))
        self.play(Write(eq_decay), Write(lam_lbl), Write(N0_lbl))
        self.wait(0.5)"""
        return _get_manim_skeleton() + body

    # ── Young's double slit / diffraction ────────────────────────────────────
    if any(k in q for k in ("double slit", "young's", "diffract", "fringe pattern",
                             "single slit", "diffraction grating")):
        import math as _math
        _d       = params.get("d", 0.0002)
        _lam_nm  = params.get("lambda", params.get("wavelength", 550.0))
        _lam_m   = _lam_nm * 1e-9 if _lam_nm > 1 else _lam_nm
        _L_screen = params.get("L", 1.0)
        _fringe_w = round(_lam_m * _L_screen / _d * 1000, 2)  # in mm
        _n_fringes = 9
        body = f"""        import math
        d, wavelength_m, L_screen = {_d}, {_lam_m:.3e}, {_L_screen}
        fringe_spacing_mm = {_fringe_w}
        n_visible = {_n_fringes}
        title = Text("{title}", font_size=28).to_edge(UP)
        barrier = Rectangle(width=0.2, height=4, color=GREY, fill_opacity=0.8).move_to(LEFT * 2.5)
        slit1 = Rectangle(width=0.25, height=0.12, color=BLACK, fill_opacity=1).move_to(LEFT * 2.5 + UP * 0.35)
        slit2 = Rectangle(width=0.25, height=0.12, color=BLACK, fill_opacity=1).move_to(LEFT * 2.5 + DOWN * 0.35)
        screen = Line(RIGHT * 2.5 + UP * 2, RIGHT * 2.5 + DOWN * 2, color=GREY, stroke_width=5)
        # Interference fringes on screen
        fringes = VGroup()
        for i in range(-{_n_fringes // 2}, {_n_fringes // 2} + 1):
            y_pos = i * 0.35
            brightness = max(0.1, 1.0 - 0.15 * abs(i))
            fringes.add(Line(
                RIGHT * 2.5 + UP * y_pos + UP * 0.14,
                RIGHT * 2.5 + UP * y_pos + DOWN * 0.14,
                color=YELLOW, stroke_width=4, stroke_opacity=brightness
            ))
        # Wave rays from slits to screen
        ray1a = Line(LEFT * 2.5 + UP * 0.35, RIGHT * 2.5, color=BLUE, stroke_width=1.5, stroke_opacity=0.5)
        ray2a = Line(LEFT * 2.5 + DOWN * 0.35, RIGHT * 2.5, color=RED, stroke_width=1.5, stroke_opacity=0.5)
        eq = MathTex(r"\\Delta = d \\sin\\theta = m\\lambda", font_size=26, color=WHITE).to_edge(DOWN).shift(UP*0.2)
        lam_lbl = MathTex(r"\\lambda = {round(_lam_nm, 0)}\\,nm,\\;d = {_d}\\,m", font_size=20, color=YELLOW).to_corner(UR).shift(DOWN*0.8)
        fringe_lbl = MathTex(r"\\Delta y = \\lambda L / d = {_fringe_w}\\,mm", font_size=20, color=GREEN).to_corner(UR).shift(DOWN*1.4)
        self.play(Write(title))
        self.play(Create(barrier), FadeIn(slit1), FadeIn(slit2))
        self.play(Create(screen))
        self.play(Create(ray1a), Create(ray2a))
        self.play(Create(fringes, run_time=2))
        self.play(Write(eq), Write(lam_lbl), Write(fringe_lbl))
        self.wait(0.5)"""
        return _get_manim_skeleton() + body

    # ── Special relativity / Time dilation / Lorentz ─────────────────────────
    if any(k in q for k in ("relativity", "time dilation", "lorentz factor",
                             "special relativity", "twin paradox", "length contraction")):
        import math as _math
        _beta = min(max(params.get("v", params.get("beta", 0.8)), 0.01), 0.9999)
        _gamma = round(1.0 / _math.sqrt(1.0 - _beta ** 2), 4)
        _n_pts = 80
        _betas = [round(i / _n_pts, 4) for i in range(_n_pts + 1)]
        _gammas = [round(1 / max(_math.sqrt(1 - b ** 2), 1e-9), 4) for b in _betas]
        body = f"""        import math
        beta_input = {_beta}
        gamma_input = {_gamma}
        beta_vals  = {_betas}
        gamma_vals = {_gammas}
        title = Text("{title}", font_size=28).to_edge(UP)
        axes = Axes(x_range=[0, 1, 0.2], y_range=[1, 6, 1], x_length=6, y_length=3.5).shift(LEFT * 0.5 + DOWN * 0.3)
        x_lbl = axes.get_x_axis_label(MathTex("v/c"))
        y_lbl = axes.get_y_axis_label(MathTex("\\\\gamma"))
        gamma_curve = axes.plot_line_graph(x_values=beta_vals, y_values=gamma_vals, line_color=BLUE, stroke_width=3, add_vertex_dots=False)
        point = Dot(axes.c2p(beta_input, gamma_input), color=RED, radius=0.12)
        h_line = DashedLine(axes.c2p(0, gamma_input), axes.c2p(beta_input, gamma_input), color=YELLOW, stroke_width=1.5)
        v_line = DashedLine(axes.c2p(beta_input, 1), axes.c2p(beta_input, gamma_input), color=YELLOW, stroke_width=1.5)
        eq_gamma = MathTex(r"\\gamma = \\frac{{1}}{{\\sqrt{{1 - v^2/c^2}}}}", font_size=26, color=BLUE).to_corner(UR).shift(DOWN*0.8)
        eq_dil   = MathTex(r"\\Delta t' = \\gamma \\Delta t", font_size=24, color=GREEN).to_corner(UR).shift(DOWN*1.5)
        eq_len   = MathTex(r"L' = L / \\gamma", font_size=24, color=ORANGE).to_corner(UR).shift(DOWN*2.1)
        gamma_val_lbl = MathTex(r"v = {_beta}c \\Rightarrow \\gamma = {_gamma}", font_size=22, color=RED).to_edge(DOWN).shift(UP*0.2)
        self.play(Write(title))
        self.play(Create(axes), Write(x_lbl), Write(y_lbl))
        self.play(Create(gamma_curve, run_time=2))
        self.play(FadeIn(point))
        self.play(Create(h_line), Create(v_line))
        self.play(Write(eq_gamma), Write(eq_dil), Write(eq_len))
        self.play(Write(gamma_val_lbl))
        self.wait(0.5)"""
        return _get_manim_skeleton() + body

    # ── Generic fallback ─────────────────────────────────────────────────────
    body = f"""        title = Text("{title}", font_size=32).to_edge(UP)
        subtitle = Text("Physics Visualization", font_size=24, color=GREY).next_to(title, DOWN)
        left  = Dot(LEFT * 3, color=BLUE)
        right = Dot(RIGHT * 3, color=YELLOW)
        connector = Arrow(left.get_center(), right.get_center(), color=WHITE)
        eq = MathTex(r"F = ma", font_size=36, color=WHITE).shift(DOWN * 1.5)
        note = MathTex(r"\\Delta p = F \\Delta t", font_size=28, color=GREEN).shift(DOWN * 2.5)

        self.play(Write(title), FadeIn(subtitle))
        self.play(FadeIn(left), FadeIn(right), Create(connector))
        self.play(Write(eq), Write(note))
        self.play(left.animate.shift(RIGHT * 2), right.animate.shift(LEFT * 2), run_time=2)
        self.wait(1)"""
    return _get_manim_skeleton() + body


def _build_few_shot_section(question: str) -> str:
    """Retrieve similar physics examples from the RAG knowledge base and format as few-shot context."""
    try:
        from backend.rag.knowledge_base import query_examples
        examples = query_examples(question, n_results=3)
        if not examples:
            return ""
        lines = ["\nHere are working examples of similar physics animations — follow their style:\n"]
        for ex in examples:
            lines.append(f"--- Example: {ex['topic']} ---")
            if ex.get("visual_rules"):
                lines.append(f"Visual style: {ex['visual_rules']}")
            lines.append(f"Working Manim code:\n{ex['manim_code']}\n")
        return "\n".join(lines)
    except Exception as e:
        logger.warning("RAG retrieval failed (non-fatal): %s", e)
        return ""


def _enforce_params_in_body(body: str, params: dict) -> str:
    """
    Post-process LLM-generated body to remove hardcoded values that shadow the
    preamble variables.

    IMPORTANT: Only strips TOP-LEVEL assignments (8-space base indent). Removing
    a variable assignment that is inside a nested block (12+ spaces) would break
    the block structure and cause SyntaxErrors (e.g. 'unexpected indent').

    Also fixes the common LLM habit of writing math.radians(45) when theta0=30.
    """
    import re as _re

    BASE_INDENT = 8  # the normalised body always has 8-space top-level indent

    lines = body.split("\n")
    out = []
    for line in lines:
        if not line.strip():
            out.append(line)
            continue

        skip = False
        current_indent = len(line) - len(line.lstrip())

        # Only enforce params on TOP-LEVEL lines (exactly BASE_INDENT spaces).
        # Deeper lines are inside blocks — removing them would orphan the block.
        if current_indent == BASE_INDENT:
            for var, val in params.items():
                m = _re.match(
                    rf"^(\s*){_re.escape(var)}\s*=\s*([-+]?\d*\.?\d+)\s*$",
                    line
                )
                if m:
                    skip = True
                    break

        if not skip:
            # Fix math.radians(hardcoded_angle) when theta0 is in params
            if "theta0" in params and "math.radians(" in line:
                line = _re.sub(
                    r'math\.radians\(\s*[-+]?\d*\.?\d+\s*\)',
                    'math.radians(theta0)',
                    line
                )
            out.append(line)

    return "\n".join(out)


def generate_manim_code(plan: str, question: str = "") -> str:
    """
    Call 2: Generate only the body of construct(); we inject it into a fixed skeleton.
    RAG examples are retrieved and injected as few-shot context to improve quality.
    Numeric parameters mentioned in the question/plan are extracted and injected explicitly.
    """
    if not (plan or "").strip():
        raise ValueError("Plan cannot be empty.")
    plan = plan.strip()[:MAX_PLAN_LENGTH]
    plan = _truncate_plan_to_word_limit(plan)
    question = (question or "").strip()[:MAX_QUESTION_LENGTH]

    # Extract numeric parameters from the USER'S QUESTION ONLY (not from the LLM plan
    # to avoid pulling in computed/derived values the plan invents)
    params = _extract_numeric_params(question)
    param_section = ""
    if params:
        param_list_log = ", ".join(f"{k}={v}" for k, v in params.items())
        logger.info("Extracted numeric params: %s", param_list_log)
        # Build strong per-param imperatives so the LLM cannot silently use defaults
        _param_lines = []
        _PARAM_DESCRIPTIONS = {
            "theta0": "launch/incline angle in degrees",
            "v0": "initial speed (m/s)",
            "v1x": "initial velocity of object 1 (m/s)",
            "v2x": "initial velocity of object 2 (m/s)",
            "m_mass": "mass (kg)",
            "m1": "mass of object 1 (kg)",
            "m2": "mass of object 2 (kg)",
            "k": "spring constant (N/m)",
            "k_wave": "wave number / spring constant",
            "g": "gravitational acceleration (m/s²)",
            "mu": "coefficient of friction",
            "L": "length (m)",
            "F": "applied force (N)",
            "R": "resistance (Ω)",
            "C": "capacitance (F)",
            "freq": "frequency (Hz)",
            "restitution": "coefficient of restitution",
            "q1": "charge 1 (C)",
            "q2": "charge 2 (C)",
        }
        for k, v in params.items():
            desc = _PARAM_DESCRIPTIONS.get(k, k)
            _param_lines.append(f"  {k} = {v}   # {desc} — USE THIS VALUE, NOT any default")
        param_section = (
            "\nREQUIRED PARAMETER VALUES — THE USER EXPLICITLY SPECIFIED THESE.\n"
            "DO NOT USE ANY DEFAULT OR TYPICAL VALUES. DO NOT HARDCODE DIFFERENT NUMBERS.\n"
            "These variables are PRE-DEFINED at the top of the body — reference them by name:\n"
            + "\n".join(_param_lines) + "\n"
        )

    # Pymunk pre-simulation for collision/rigid-body questions
    pymunk_section = ""
    q_lower = question.lower()
    if any(k in q_lower for k in ("collision", "collide", "elastic", "inelastic",
                                   "billiard", "bounce", "newton's cradle", "rigid body")):
        traj_repr = pymunk_simulate_collision(params)
        if traj_repr:
            # Downsample to ≤60 frames so the embedded repr stays compact and valid
            _traj_full = eval(traj_repr)   # safe — we built this ourselves
            _step = max(1, len(_traj_full) // 60)
            _traj_short = _traj_full[::_step]
            traj_embedded = repr(_traj_short)
            pymunk_section = (
                f"\nPre-computed pymunk collision trajectory — assign this EXACTLY at the top of "
                f"your construct body as `_traj = <list>`, then animate Dots along the frames:\n"
                f"_traj = {traj_embedded}\n"
                f"Each frame is a dict with keys: t, x1, y1, x2, y2 (physics units). "
                f"Use axes.c2p(fr['x1'], 0) / axes.c2p(fr['x2'], 0) to position Dots.\n"
            )
            logger.info("Pymunk trajectory injected (%d frames → %d downsampled)",
                        len(_traj_full), len(_traj_short))

    few_shot = _build_few_shot_section(question or plan)
    if few_shot:
        logger.info("RAG: injected %d chars of few-shot examples", len(few_shot))

    # Build a section telling the LLM which physics conditions apply (no friction, elastic, etc.)
    conditions = _extract_physics_conditions(question)
    condition_section = ""
    if conditions:
        cond_strs = []
        if conditions.get("mu") == 0.0:
            cond_strs.append("FRICTIONLESS (mu=0): do NOT draw a friction arrow or label")
        if conditions.get("g") == 0.0:
            cond_strs.append("NO GRAVITY (g=0): do NOT draw a weight/gravity arrow")
        if conditions.get("restitution") == 1.0:
            cond_strs.append("ELASTIC COLLISION (e=1): KE is conserved, balls fully bounce")
        if conditions.get("restitution") == 0.0:
            cond_strs.append("PERFECTLY INELASTIC (e=0): balls stick together after collision")
        if conditions.get("drag") == 0.0:
            cond_strs.append("NO AIR RESISTANCE: ignore drag force")
        if cond_strs:
            condition_section = "\nPHYSICS CONDITIONS (READ CAREFULLY AND OBEY):\n" + "\n".join(f"- {c}" for c in cond_strs) + "\n"

    prompt = f"""Question: {question}
Plan: {plan}
{param_section}{condition_section}{pymunk_section}{few_shot}
Write ONLY the body of the construct(self) method for a Manim scene. Rules:
- Output only the indented lines that go inside def construct(self): (use 4 spaces per indent level).
- Choose visuals based on the question domain (mechanics, waves, E&M, optics, thermo, modern physics).

PHYSICS CONDITIONS: If the question says "no friction", "frictionless", "elastic", "no gravity", etc., you MUST obey those conditions:
  * "no friction" / "frictionless" → set mu=0, do NOT draw a friction arrow or friction label.
  * "elastic collision" → e=1, KE is conserved, state this explicitly.
  * "no gravity" / "in space" → g=0, do NOT draw a gravity/weight arrow.
  * "perfectly inelastic" → e=0, objects stick together.

MOVING OBJECTS RULE — CRITICAL: When an object (block, ball, dot, etc.) moves during the animation:
  * Force/velocity ARROWS must use always_redraw (geometry must rebuild each frame):
    f_arrow = always_redraw(lambda: Arrow(block.get_right(), block.get_right()+RIGHT*1.5, color=YELLOW, buff=0))
  * Force/velocity LABELS must be compiled ONCE and repositioned via add_updater (avoids per-frame LaTeX recompile):
    f_label = MathTex(r"F=10\,N", font_size=22, color=YELLOW)
    f_label.add_updater(lambda m: m.next_to(f_arrow, UP, buff=0.1))
  * self.add(f_arrow, f_label) before the animation, then self.play(block.animate.shift(...))
  * NEVER use always_redraw(lambda: MathTex(...)) for labels — it recompiles LaTeX every frame and is very slow.
  * NEVER create a static Arrow(block.get_right(), ...) when block will be moved — it will be left behind.
  * Keep total animation time ≤ 10 seconds. Use run_time ≤ 1.8 for movement, self.wait(0.5) between steps.

FORCE DIAGRAM RULES:
  * Draw ONLY the forces that actually exist in the scenario (read the physics conditions above).
  * For a block on a surface: show Normal force (GREEN, up), Weight (RED, down), applied F (YELLOW, right).
  * Add friction (RED, left) ONLY IF mu > 0 (the scenario has friction).
  * Label each force with MathTex (e.g., MathTex(r"N"), MathTex(r"mg"), MathTex(r"F")).

VISUALIZATION RULES:
  * MathTex for all equations and Greek letters. Text() for plain word labels and titles.
  * Colors: RED=forces/weight, BLUE=objects, YELLOW=applied-force/trajectories, GREEN=normal-force/velocity, WHITE=equations.
  * Include a title Text at the top.

- Standard Manim CE objects: Axes, Line, DashedLine, Circle, Dot, Rectangle, Arrow, Arc, Text, MathTex, VGroup, ValueTracker, always_redraw, TracedPath, np, math.
- For ODE physics: use `from scipy.integrate import solve_ivp`.
- For rigid body / collision: use `import pymunk`.
- NO Spring, Wall, or non-standard Manim objects.
- NO docstrings, NO comments, NO prose. Only executable code.
- First line must be code (e.g. title = Text(...)).
- CRITICAL: DO NOT write physics arithmetic as Python (NEVER `F = mv**2/r`, `a = F/m`, `p = mv` etc.). All physics equations go in MathTex strings only.
Output only code, no markdown, no backticks."""

    param_names_hint = ""
    if params:
        pairs = ", ".join(f"{k}={v}" for k, v in params.items())
        param_names_hint = (
            f" CRITICAL: The user specified these exact values: {pairs}. "
            f"These variables ({', '.join(params.keys())}) are PRE-DEFINED at the top of the body. "
            f"DO NOT hardcode any different number for these quantities. "
            f"Reference the variable names directly (e.g. math.radians(theta0), not math.radians(45))."
        )

    # Build a param-awareness hint for the system prompt
    _param_no_redefine = ""
    if params:
        _param_no_redefine = (
            f"\n\nPRE-DEFINED VARIABLES — DO NOT REDEFINE THESE AT ALL: "
            + ", ".join(f"{k}={v}" for k, v in params.items())
            + ". They are already defined at the very top of the method body. "
            "Reference them directly by name. Never write them inside a nested block."
        )

    _voiceover_sys = _VOICEOVER_PROMPT_HINT if VOICEOVER_ENABLED else ""
    content = _call_llm(
        messages=[
            {"role": "system", "content": (
                "You output ONLY the body of the Manim construct() method. "
                "Code only. INDENTATION RULES (critical): use 4 spaces per indent level. "
                "ALL top-level statements (variable definitions, self.play, self.add, etc.) "
                "must be at 4-space indent — never wrap them in an outer if/with/for block. "
                "Nested blocks inside loops/conditions use 8 spaces, 12 spaces, etc. "
                "Use MathTex for equations, always_redraw for force arrows on moving objects. "
                "OBEY physics conditions strictly: no friction = no friction arrow; elastic = e=1; frictionless = mu=0. "
                "Available imports: manim (via `from manim import *`), numpy as np, "
                "scipy (use `from scipy.integrate import solve_ivp` for ODEs), "
                "pymunk (use `import pymunk` for rigid body). "
                + param_names_hint + _param_no_redefine + _voiceover_sys
            )},
            {"role": "user", "content": prompt}
        ],
        model=CODE_MODEL,
    )
    if not content:
        raise ValueError("API returned no code.")
    body = _clean_construct_body(content)

    if params:
        # 1. Strip any LLM lines that shadow the preamble with wrong values
        body = _enforce_params_in_body(body, params)
        # 2. Prepend guaranteed-correct preamble at the very top
        body = _params_preamble(params) + "\n" + body

    body = _sanitize_undefined_physics_vars(body)

    # Final safety: ensure the combined code is syntactically valid
    import ast as _ast
    full_src = _get_manim_skeleton() + body
    try:
        _ast.parse(full_src)
    except SyntaxError as se:
        logger.warning("Post-preamble SyntaxError (%s), asking Claude to fix it", se)
        # Ask Claude to rewrite the broken code instead of repeating the same steps
        try:
            fixed_content = _call_llm(
                messages=[
                    {"role": "system", "content": (
                        "You output ONLY the body of the Manim construct() method. "
                        "Code only, 4-space indent per level. ALL top-level statements "
                        "must be at exactly 4 spaces (they will be placed inside a method). "
                        "Do NOT wrap code in an outer block. Do NOT define variables that "
                        "are pre-defined: " + ", ".join(f"{k}={v}" for k, v in params.items()) + ". "
                        "Fix the indentation so the code is valid Python."
                    ) if params else (
                        "You output ONLY the body of the Manim construct() method. "
                        "Code only, 4-space indent per level. Fix any indentation errors."
                    )},
                    {"role": "user", "content": (
                        f"The following construct() body has a SyntaxError: {se}\n"
                        f"Rewrite it correctly:\n{content}"
                    )},
                ],
                model=CODE_MODEL,
            )
            body = _clean_construct_body(fixed_content)
            if params:
                body = _enforce_params_in_body(body, params)
                body = _params_preamble(params) + "\n" + body
            body = _sanitize_undefined_physics_vars(body)
            logger.info("Claude SyntaxError fix succeeded")
        except Exception as fix_err:
            logger.warning("Claude SyntaxError fix failed (%s), using raw body", fix_err)

    return _get_manim_skeleton() + body


def generate_plan_and_code(question: str) -> tuple[str, str]:
    """
    Single LLM call that returns both animation plan and Manim construct() body.
    Saves one full API round-trip vs calling generate_animation_plan + generate_manim_code.
    Returns (plan_str, full_manim_code_str).
    Raises ValueError if the combined call fails (caller should fall back to two-step flow).
    """
    if not (question or "").strip():
        raise ValueError("Question cannot be empty.")
    question = question.strip()[:MAX_QUESTION_LENGTH]

    params = _extract_numeric_params(question)
    param_section = ""
    if params:
        _PARAM_DESCRIPTIONS = {
            "theta0": "launch/incline angle in degrees",
            "v0": "initial speed (m/s)", "v1x": "velocity of obj 1 (m/s)",
            "v2x": "velocity of obj 2 (m/s)", "m_mass": "mass (kg)",
            "m1": "mass of obj 1 (kg)", "m2": "mass of obj 2 (kg)",
            "k": "spring constant (N/m)", "g": "gravity (m/s²)",
            "mu": "friction coeff", "L": "length (m)", "F": "force (N)",
            "R": "resistance (Ω)", "C": "capacitance (F)", "freq": "frequency (Hz)",
        }
        _lines = [
            f"  {k} = {v}   # {_PARAM_DESCRIPTIONS.get(k, k)} — USE THIS VALUE"
            for k, v in params.items()
        ]
        param_section = (
            "\nREQUIRED PARAMETER VALUES — DO NOT USE DEFAULTS OR HARDCODE DIFFERENT NUMBERS:\n"
            + "\n".join(_lines) + "\n"
        )

    few_shot = _build_few_shot_section(question)

    prompt = f"""Physics question: {question}
{param_section}{few_shot}
Output ONLY valid JSON (no markdown, no backticks) with exactly two keys:
  "plan": A numbered animation plan, 4-8 steps, max 150 words. Focus on what Manim objects/forces/equations to draw.
  "code": ONLY the body of construct(self). 4-space indented Python. No class, no imports, no markdown.

JSON:
{{"plan": "1. Draw ...", "code": "    title = Text(...)"}}

Physics code rules:
- MathTex for equations and Greek letters; Text for plain labels.
- Colors: RED=forces, BLUE=objects, YELLOW=paths, GREEN=velocity, WHITE=equations.
- Always show force arrows (Arrow) for ALL relevant forces with MathTex labels.
- ValueTracker + always_redraw for smooth motion.
- NEVER write physics arithmetic as Python (mv, Fc, etc. NOT defined) — use MathTex strings.
- First line must be code (e.g. title = Text(...))."""

    param_hint = ""
    if params:
        pairs = ", ".join(f"{k}={v}" for k, v in params.items())
        param_hint = (
            f" CRITICAL: user specified {pairs}. "
            f"These variables ({', '.join(params.keys())}) are PRE-DEFINED. "
            f"DO NOT hardcode different values. Use variable names directly "
            f"(e.g. math.radians(theta0) not math.radians(45))."
        )

    _no_redefine_hint = ""
    if params:
        _no_redefine_hint = (
            f" PRE-DEFINED (DO NOT redefine or put inside any block): "
            + ", ".join(f"{k}={v}" for k, v in params.items()) + "."
        )

    _voiceover_sys = _VOICEOVER_PROMPT_HINT if VOICEOVER_ENABLED else ""
    raw = _call_llm(
        messages=[
            {"role": "system", "content": (
                "You output ONLY valid compact JSON with keys 'plan' (string) and 'code' (string). "
                "The 'code' value is construct() body only, 4-space indented Python. "
                "INDENTATION: ALL top-level statements at 4 spaces; never wrap in an outer block. "
                "No markdown. No prose outside JSON." + param_hint + _no_redefine_hint + _voiceover_sys
            )},
            {"role": "user", "content": prompt},
        ],
        model=CODE_MODEL,
    )

    if not (raw or "").strip():
        raise ValueError("Combined LLM call returned empty response.")

    raw = raw.strip()
    if raw.startswith("```"):
        parts = raw.split("```")
        raw = parts[1] if len(parts) > 1 else raw[3:]
        if raw.lower().startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    try:
        result = json.loads(raw)
    except json.JSONDecodeError as e:
        logger.warning("generate_plan_and_code JSON parse failed (%s), will fall back", e)
        raise ValueError(f"Combined LLM JSON parse failed: {e}")

    plan = (result.get("plan") or "").strip()
    code_body_raw = (result.get("code") or "").strip()

    if not plan or not code_body_raw:
        raise ValueError("Combined LLM returned empty plan or code.")

    plan = _truncate_plan_to_word_limit(plan)
    body = _clean_construct_body(code_body_raw)
    if params:
        body = _enforce_params_in_body(body, params)
        body = _params_preamble(params) + "\n" + body
    body = _sanitize_undefined_physics_vars(body)

    full_src = _get_manim_skeleton() + body
    import ast as _ast
    try:
        _ast.parse(full_src)
    except SyntaxError as se:
        logger.warning("generate_plan_and_code SyntaxError in combined code (%s), falling back", se)
        raise ValueError(f"Combined code has syntax error: {se}")

    logger.info("generate_plan_and_code success: plan=%d chars, code=%d chars", len(plan), len(full_src))
    return plan, full_src


def _extract_construct_body(full_code: str) -> str | None:
    """Extract the body of construct(self): from full script. Returns None if not found."""
    lines = full_code.splitlines()
    in_construct = False
    base_indent = 0
    body_lines = []
    for line in lines:
        stripped = line.strip()
        if "def construct(self)" in stripped and ":" in stripped:
            in_construct = True
            base_indent = len(line) - len(line.lstrip())
            continue
        if in_construct:
            if not stripped:
                body_lines.append("")
                continue
            indent = len(line) - len(line.lstrip())
            if indent <= base_indent and stripped.startswith("def "):
                break
            body_lines.append(line)
    if not body_lines:
        return None
    return "\n".join(body_lines)


def fix_manim_code(plan: str, failing_code: str, error_trace: str) -> str:
    """
    Call 3: Fix the construct body (or full code) and return script with our skeleton.
    """
    plan = _truncate_plan_to_word_limit((plan or "").strip())
    error_trace = (error_trace or "")[:2000]

    # Try to get only the body so we can ask for a minimal fix
    body = _extract_construct_body(failing_code)
    if body:
        prompt = f"""Plan: {plan}

Current construct(self) body (it failed):
```python
{body}
```

Error: {error_trace}

Fix the body only. Output ONLY the corrected body of construct(self): indented lines of code.
No class, no imports, no explanation.
- Use MathTex for equations and Greek letters, Text() for plain word labels.
- NEVER write physics arithmetic as Python expressions (`mv`, `Fc`, `v0` etc. are NOT Python variables — put them in MathTex strings instead).
- Available: `from manim import *`, `import numpy as np`, `from scipy.integrate import solve_ivp` (for ODEs), `import pymunk` (for rigid body).
- Use standard Manim CE objects only: Axes, Line, Arrow, Arc, Dot, Circle, Rectangle, DashedLine, Text, MathTex, VGroup, ValueTracker, always_redraw, np, math.
- Do NOT use Spring, Wall, or any object not listed above."""
        _voiceover_sys = _VOICEOVER_PROMPT_HINT if VOICEOVER_ENABLED else ""
        content = _call_llm(
            messages=[
                {"role": "system", "content": "You output only the fixed construct() method body. Code only." + _voiceover_sys},
                {"role": "user", "content": prompt}
            ],
            model=CODE_MODEL,
        )
        if content:
            body = _clean_construct_body(content)
            return _get_manim_skeleton() + body

    # Fallback: ask for full code, clean, then try to use body or full cleaned code
    prompt = f"""Plan: {plan}

Failed code:
```python
{failing_code[:6000]}
```

Error: {error_trace}

Output ONLY the fixed Python code: from manim import *, class PhysicsAnimation(Scene), def construct(self): with body. No prose. No markdown.
Available libraries: scipy (from scipy.integrate import solve_ivp), pymunk, matplotlib, numpy (as np)."""
    content = _call_llm(
        messages=[
            {"role": "system", "content": (
                "Output only raw Python code. "
                "from manim import * then class PhysicsAnimation(Scene): then def construct(self): and body. "
                "Use scipy for ODE solving, pymunk for collisions, standard Manim CE for visuals."
            )},
            {"role": "user", "content": prompt}
        ],
        model=CODE_MODEL,
    )
    if not content:
        raise ValueError("API returned no fixed code.")
    full = _clean_python_code(content)
    body = _extract_construct_body(full)
    if body:
        return _get_manim_skeleton() + _clean_construct_body(body)
    return full


def _looks_like_prose_line(line: str) -> bool:
    """True if this line is LLM commentary/markdown, not Python code."""
    s = line.strip()
    if not s:
        return False  # keep blank lines
    # Markdown list / emphasis (e.g. "* **Crucial**: ..." or " * **Crucial**:" or "- item")
    if s.startswith("* ") or s.startswith("** ") or s.startswith("- ") or s.startswith("*\t"):
        return True
    if s.startswith(" * ") or (len(s) > 3 and s[0] == " " and s.lstrip().startswith("*")):
        return True
    if s.startswith("**") and ("**:" in s or "**: " in s):  # "**Crucial**: text"
        return True
    # Python code usually has these; prose often doesn't
    has_code_chars = any(c in s for c in "=():[]\"'") or s.startswith("#") or "self." in s or " def " in s or " class " in s
    if has_code_chars:
        return False
    # Sentence-like lines that are clearly not code
    prose_starts = (
        "crucial", "note:", "since ", "these ", "i should", "i need", "we need",
        "the arrow", "the bob", "manim's", "i'll ", "we'll ", "for example",
        "that is", "this is", "we should", "we can", "you can", "one can",
        "i'll break", "the code defines", "the code creates", "it creates", "it defines",
        "this script", "this animation", "here we", "in this",
    )
    if s.lower().startswith(prose_starts):
        return True
    # Long line with no Python structure, ends with period
    if len(s) > 50 and s.endswith(".") and "(" not in s and "=" not in s:
        return True
    # Long paragraph-like line (e.g. "I'll break down the key physics...") - no code chars
    if len(s) > 80 and not any(c in s for c in "=():[]\"'") and not s.startswith("#"):
        if "self." not in s and " def " not in s and " class " not in s:
            return True
    # Numbered prose (e.g. "1. The user wants" or "2. We should draw") - not valid Python
    if len(s) > 4 and s[0].isdigit():
        rest = s.lstrip("0123456789").strip()
        if rest.startswith(".") and rest[1:2].isspace():
            return True
    return False


def followup_chat(
    message: str,
    history: list[dict],
    previous_plan: str,
    previous_code: str,
    original_question: str,
) -> dict:
    """
    Handle a follow-up message. The LLM decides whether to answer with text
    or generate a new animation. Returns {"type": "text", "reply": "..."} or
    {"type": "animate", "reply": "...", "plan": "..."}.
    """
    message = (message or "").strip()[:MAX_QUESTION_LENGTH]
    if not message:
        raise ValueError("Follow-up message cannot be empty.")

    # Extract numeric params AND physics conditions from the follow-up message
    followup_params = _extract_numeric_params(message)
    followup_conditions = _extract_physics_conditions(message)

    # Build a combined hints string for the system prompt
    condition_hints = ""
    hints = []
    if followup_conditions.get("mu") == 0.0:
        hints.append("mu=0 (FRICTIONLESS — remove friction arrow entirely)")
    if followup_conditions.get("g") == 0.0:
        hints.append("g=0 (NO GRAVITY — remove weight arrow entirely)")
    if followup_conditions.get("restitution") == 1.0:
        hints.append("e=1 (ELASTIC — kinetic energy conserved)")
    if followup_conditions.get("restitution") == 0.0:
        hints.append("e=0 (PERFECTLY INELASTIC — objects stick together)")
    if hints:
        condition_hints = f"\nDetected physics conditions: {'; '.join(hints)}\n"

    # Build numeric param hint for any explicitly specified values
    param_hint_str = ""
    if followup_params:
        _PARAM_DESCRIPTIONS = {
            "theta0": "launch/incline angle (degrees)", "v0": "initial speed (m/s)",
            "v1x": "velocity obj 1 (m/s)", "v2x": "velocity obj 2 (m/s)",
            "m_mass": "mass (kg)", "m1": "mass obj 1 (kg)", "m2": "mass obj 2 (kg)",
            "k": "spring constant (N/m)", "g": "gravity (m/s²)", "mu": "friction coeff",
            "L": "length (m)", "F": "applied force (N)", "R": "resistance (Ω)",
            "C": "capacitance (F)", "freq": "frequency (Hz)", "lambda": "wavelength (m)",
            "q1": "charge 1 (C)", "q2": "charge 2 (C)", "V": "voltage (V)",
        }
        _plines = [
            f"  {k} = {v}  ({_PARAM_DESCRIPTIONS.get(k, k)})"
            for k, v in followup_params.items()
        ]
        param_hint_str = (
            "\nREQUIRED — user explicitly specified these values. "
            "The plan MUST use them exactly:\n" + "\n".join(_plines) + "\n"
        )

    system_prompt = f"""You are PhysiMate, an expert physics tutor and Manim animator.
The user already generated a physics animation and is now asking a follow-up.

You MUST respond with valid JSON (no markdown, no code fences) in one of two formats:

1. If the user is asking a factual/conceptual question (not requesting a new animation):
{{"type": "text", "reply": "Your clear physics explanation here..."}}

2. If the user wants to change parameters, add/remove forces, or create a modified animation:
{{"type": "animate", "reply": "Brief description of the change", "plan": "1. step one\\n2. step two\\n3. step three"}}

CRITICAL RULES for deciding the type:
- "what if no friction?" / "remove friction" / "frictionless" → type=animate, plan must say to OMIT the friction arrow entirely.
- "what if elastic?" / "make it elastic" → type=animate, plan must set e=1 and state KE is conserved.
- "change mass to 5" / "set m1=2" → type=animate with new parameters.
- "how does it work?" / "explain why" / "what is..." → type=text explanation.

Rules for the plan (if type is animate):
- Keep it under 200 words, numbered steps only.
- Step 1 MUST list ALL numeric parameters as: "Set params: mu=0, m=2, v0=5 etc."
- If a force is removed (e.g., no friction), step 1 must say "Set mu=0. Do NOT draw friction arrow."
- If a physics condition changes (elastic/inelastic/frictionless/gravity), state it explicitly.
- Focus on what to draw and animate in Manim.
- ALL force arrows on moving objects must use always_redraw so they track the object.
- Do NOT include code, just the plan steps.
{param_hint_str}
Always respond with ONLY the JSON object, nothing else."""

    if condition_hints:
        system_prompt += f"\n\nNote: {condition_hints.strip()}"

    messages = [{"role": "system", "content": system_prompt}]

    context = f"Original question: {original_question}\n\nPrevious animation plan:\n{previous_plan[:1500]}"
    messages.append({"role": "user", "content": context})
    messages.append({"role": "assistant", "content": "Understood. I have the context of the previous animation."})

    for h in (history or [])[-10:]:
        role = h.get("role", "user")
        content = h.get("content", "")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content[:2000]})

    messages.append({"role": "user", "content": message})

    raw = _call_llm(messages=messages, model=MODEL_NAME)

    # Strip markdown code fences if present
    if raw.startswith("```"):
        raw = raw.split("```")[1] if "```" in raw[3:] else raw[3:]
        if raw.lower().startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        # If LLM didn't return valid JSON, treat as text reply
        return {"type": "text", "reply": raw}

    resp_type = result.get("type", "text")
    reply = result.get("reply", "")

    if resp_type == "animate":
        plan = result.get("plan", "")
        if not plan:
            return {"type": "text", "reply": reply or raw}
        # Pass extracted params back so main.py can thread them into generate_manim_code
        return {"type": "animate", "reply": reply, "plan": plan,
                "params": followup_params}

    return {"type": "text", "reply": reply or raw}


def _clean_python_code(code: str | None) -> str:
    if not code:
        return ""
    code = code.strip()
    # Remove markdown code fences
    if code.startswith("```python"):
        code = code.removeprefix("```python").strip()
    elif code.startswith("```"):
        code = code.removeprefix("```").strip()
    if code.endswith("```"):
        code = code.removesuffix("```").strip()

    lines = code.splitlines()
    # Find first line that is the manim import (ignore leading commentary)
    start_idx = 0
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("from manim import") or stripped.startswith("import manim"):
            start_idx = i
            break
        # Skip empty lines and obvious non-Python (prose) at the start
        if stripped and not stripped.startswith("#"):
            # If we hit something that looks like prose before finding import, keep searching
            prose_starts = ("let's", "the user", "the code", "here", "this ", "note:", "sure,", "i've", "we need", "we'll", "output:", "below")
            if stripped.lower().startswith(prose_starts):
                continue
            # Line might be code; if we haven't found import yet, start from first line that looks like code
            if "import" in stripped or "class " in stripped or "def " in stripped:
                start_idx = i
                break

    code_lines = lines[start_idx:]
    # Remove prose/markdown lines that appear in the middle of the code
    code_lines = [_line for _line in code_lines if not _looks_like_prose_line(_line)]
    # Strip trailing LLM commentary (prose after the code)
    while len(code_lines) > 1:
        last = code_lines[-1].strip()
        if not last:
            code_lines.pop()
            continue
        # Trailing prose often starts with these
        prose_starts = ("let's", "the user", "the code", "here", "this ", "note:", "sure,", "i've", "we need", "we'll", "output:", "below", "the above", "in this", "this script")
        if last.lower().startswith(prose_starts):
            code_lines.pop()
            continue
        # Line with no Python structure is likely prose (no = ( ) : [ ] " ' def class self.
        if not any(c in last for c in "=():[]\"'") and not last.startswith("#") and not last.startswith(" "):
            if len(last) > 40 or last.endswith("."):  # Sentence-like
                code_lines.pop()
                continue
        break

    result = "\n".join(code_lines).strip()
    if not result:
        return code.strip()
    # Ensure we never start with prose: code must begin with manim import
    first_stripped = result.lstrip().split("\n")[0].strip() if result else ""
    if not first_stripped.startswith("from manim import") and not first_stripped.startswith("import manim"):
        lines_result = result.splitlines()
        for i, line in enumerate(lines_result):
            s = line.strip()
            if s.startswith("from manim import") or s.startswith("import manim"):
                result = "\n".join(lines_result[i:]).strip()
                break
        else:
            result = "from manim import *\n\n" + result
    return result


# ── Interactive Physics Simulator (Matter.js scene generation) ──────────────

# Map scene labels → builder functions (populated after the builders are defined below)
_SCENE_DISPATCH: dict = {}   # filled at module end via _register_scene_builders()

_VALID_SCENES = frozenset([
    "force", "collision", "pendulum", "projectile",
    "spring", "incline", "freefall", "pulley", "circular",
])


def _llm_classify_scene(question: str) -> str:
    """
    Ask Claude (Anthropic) to classify the physics question into one of the
    supported interactive-simulation scenarios.
    Returns a scene label string or 'unsupported'.
    Uses the fast MODEL_NAME (haiku) for minimal latency.
    """
    try:
        raw = _call_llm(
            messages=[
                {"role": "system", "content": (
                    "You are a physics simulation classifier. "
                    "Given a physics question, output ONLY the single best-matching scenario name — nothing else. "
                    "Scenarios:\n"
                    "  force      – block on surface, applied force, friction, Newton's 2nd law, F=ma\n"
                    "  collision  – elastic/inelastic collision, momentum transfer, two balls hitting\n"
                    "  pendulum   – simple pendulum, swinging bob, string pendulum\n"
                    "  projectile – thrown or launched object, parabolic trajectory, cannon ball\n"
                    "  spring     – spring-mass, Hooke's law, SHM, harmonic oscillator, coefficient of restitution bounce\n"
                    "  incline    – block sliding on ramp or inclined plane, wedge\n"
                    "  freefall   – object dropped, terminal velocity, free-fall, falling under gravity\n"
                    "  pulley     – Atwood machine, two masses over a pulley\n"
                    "  circular   – centripetal force, uniform circular motion, orbit, revolution\n"
                    "  unsupported – waves, electric/magnetic fields, thermodynamics, optics, nuclear, circuits, anything else\n"
                    "Output exactly one word from the list above."
                )},
                {"role": "user", "content": question},
            ],
            model=MODEL_NAME,
            max_retries=1,
        )
        label = (raw or "").strip().lower().split()[0] if raw else "unsupported"
        return label if label in _VALID_SCENES else "unsupported"
    except Exception as exc:
        logger.warning("LLM scene classification failed (%s), defaulting to unsupported", exc)
        return "unsupported"


def generate_matter_scene(question: str, params: dict | None = None) -> dict:
    """
    Generate a Matter.js interactive scene configuration for the given physics question.
    Returns a JSON-serialisable dict the frontend uses to build the live simulation.
    """
    if params is None:
        params = _extract_numeric_params(question)
    q = question.lower()

    # Check more specific domains FIRST so "block on incline" isn't caught by the force check
    def _has(*keywords):
        return any(k in q for k in keywords)

    def _lacks(*keywords):
        return not any(k in q for k in keywords)

    # ── 1. Pulley / Atwood — before any "pull" check ────────────────────────
    if _has("pulley", "atwood"):
        return _matter_pulley(params, question)

    # ── 2. Inclined plane ────────────────────────────────────────────────────
    if _has("incline", "inclined", "ramp", "wedge"):
        return _matter_incline(params, question)
    # "slope" only when clearly about an inclined surface, not a graph
    if "slope" in q and _has("block", "mass", "angle", "slide", "friction", "plane") and _lacks("graph", "velocity-time", "time graph", "position-time"):
        return _matter_incline(params, question)

    # ── 3. Pendulum ───────────────────────────────────────────────────────────
    if _has("pendulum", "simple pendulum") and _lacks("wave"):
        return _matter_pendulum(params, question)
    # "bob" only in clear pendulum context, not as a proper noun
    if "bob" in q and _has("swing", "string", "pivot", "pendulum", "oscillat", "angle"):
        return _matter_pendulum(params, question)

    # ── 4. Spring / SHM ───────────────────────────────────────────────────────
    if _has("spring", "hooke", "shm", "simple harmonic"):
        return _matter_spring(params, question)
    if "oscillat" in q and _lacks("electric", "magnetic", "wave", "circuit", "lc"):
        return _matter_spring(params, question)

    # ── 5. Circular / centripetal motion ─────────────────────────────────────
    if _has("centripetal", "centrifugal", "uniform circular"):
        return _matter_circular(params, question)
    if "circular" in q and _has("motion", "orbit", "force", "velocity", "speed", "acceleration"):
        return _matter_circular(params, question)
    if _has("orbit", "revolution") and _lacks("electron", "atomic", "bohr", "wave", "light"):
        return _matter_circular(params, question)

    # ── 6. Collision / momentum ───────────────────────────────────────────────
    if _has("collision", "collide", "billiard"):
        return _matter_collision(params, question)
    if _has("elastic", "inelastic") and _has("ball", "mass", "object", "m1", "m2", "momentum", "velocity", "collision"):
        return _matter_collision(params, question)
    if "momentum" in q and _lacks("angular", "orbital") and _has("conserv", "ball", "mass", "object", "m1", "m2", "collision", "transfer"):
        return _matter_collision(params, question)

    # ── 7. Projectile motion ─────────────────────────────────────────────────
    if _has("projectile", "trajectory", "cannon"):
        return _matter_projectile(params, question)
    if "throw" in q and _has("ball", "object", "mass", "angle", "velocity", "horizontal", "vertical", "air"):
        return _matter_projectile(params, question)
    if "launch" in q and _has("angle", "speed", "velocity", "ball", "object", "horizontal") and _lacks("rocket", "space", "satellite"):
        return _matter_projectile(params, question)

    # ── 8. Applied force / Newton's 2nd law ──────────────────────────────────
    # "newton" only when clearly F=ma, not Newton's law of cooling / gravitation
    _newton_2nd = (
        "newton" in q
        and _lacks("cooling", "gravitation", "universal", "unit")
        and _has("second", "2nd", "f=ma", "force", "acceleration", "mass")
    )
    if _has("friction") and _lacks("pendulum", "pulley", "collision", "orbital", "incline", "ramp", "slope"):
        return _matter_force(params, question)
    if _has("push", "applied force") and _lacks("pendulum", "pulley", "collision"):
        return _matter_force(params, question)
    if "pull" in q and _lacks("pulley", "pendulum", "collision"):
        return _matter_force(params, question)
    if "force" in q and _lacks("centripetal", "centrifugal", "magnetic", "electric", "lorentz", "buoyant", "nuclear", "gravitational force", "collision"):
        return _matter_force(params, question)
    if "block" in q and _lacks("diagram", "chain", "collision", "incline", "ramp", "slope", "pulley"):
        return _matter_force(params, question)
    if _newton_2nd:
        return _matter_force(params, question)

    # ── 9. Free fall ─────────────────────────────────────────────────────────
    if _has("free fall", "freefall"):
        return _matter_freefall(params, question)
    if "falling" in q and _lacks("pendulum", "projectile"):
        return _matter_freefall(params, question)
    # "drop" only in falling-object context, not electrical/thermal
    if "drop" in q and _has("ball", "object", "mass", "height", "free", "gravity", "kg") and _lacks("voltage", "pressure", "temperature", "current", "potential"):
        return _matter_freefall(params, question)
    if "gravity" in q and _has("fall", "drop", "object", "mass", "terminal") and _lacks("wave", "assist", "potential energy", "orbital", "circular"):
        return _matter_freefall(params, question)

    # ── 10. LLM fallback — ask Claude when keyword matching is inconclusive ──
    # This is what keeps the interactive in sync with the video (both use Anthropic).
    label = _llm_classify_scene(question)
    if label in _VALID_SCENES:
        fn = _SCENE_DISPATCH.get(label)
        if fn:
            return fn(params, question)

    return {
        "supported": False,
        "domain": "unsupported",
        "message": "Interactive simulation not yet available for this domain. Watch the video explanation instead.",
    }


def _matter_force(params: dict, question: str) -> dict:
    import math as _m
    mass  = float(params.get("m_mass", params.get("mass", 2.0)))
    F     = float(params.get("F", params.get("freq", 10.0)))
    mu    = float(params.get("mu", 0.3))
    g     = float(params.get("g", 9.8))
    fric  = round(mu * mass * g, 2)
    a     = round((F - fric) / mass, 2) if mass > 0 else 0.0
    return {
        "supported": True,
        "domain": "force",
        "physics": {"scenario": "force", "initialParams": {"mass": mass, "force": F, "friction": mu, "g": g}},
        "params": [
            {"id": "mass",     "label": "Mass",          "value": mass, "min": 0.5, "max": 10, "step": 0.5,  "unit": "kg"},
            {"id": "force",    "label": "Applied Force", "value": F,    "min": 0,   "max": 50, "step": 1,    "unit": "N"},
            {"id": "friction", "label": "Friction μ",    "value": mu,   "min": 0,   "max": 1,  "step": 0.05, "unit": ""},
        ],
        "equation": f"a = (F − μmg)/m = ({F} − {fric})/{mass} = {a} m/s²",
    }


def _matter_collision(params: dict, question: str) -> dict:
    m1  = float(params.get("m1", 1.0))
    m2  = float(params.get("m2", 1.5))
    v1  = float(params.get("v1x", params.get("v0", 3.0)))
    v2  = float(params.get("v2x", 0.0))
    e   = float(params.get("restitution", 1.0))
    den = m1 + m2
    v1f = round(((m1 - e * m2) * v1 + (1 + e) * m2 * v2) / den, 2)
    v2f = round(((m2 - e * m1) * v2 + (1 + e) * m1 * v1) / den, 2)
    KE_i = round(0.5 * m1 * v1 ** 2 + 0.5 * m2 * v2 ** 2, 2)
    KE_f = round(0.5 * m1 * v1f ** 2 + 0.5 * m2 * v2f ** 2, 2)
    return {
        "supported": True,
        "domain": "collision",
        "physics": {"scenario": "collision", "initialParams": {"m1": m1, "m2": m2, "v1": v1, "v2": v2, "restitution": e}},
        "params": [
            {"id": "m1",          "label": "Mass 1",       "value": m1, "min": 0.5, "max": 8,  "step": 0.5, "unit": "kg"},
            {"id": "m2",          "label": "Mass 2",       "value": m2, "min": 0.5, "max": 8,  "step": 0.5, "unit": "kg"},
            {"id": "v1",          "label": "Velocity 1",   "value": v1, "min": 0,   "max": 12, "step": 0.5, "unit": "m/s"},
            {"id": "restitution", "label": "Restitution e","value": e,  "min": 0,   "max": 1,  "step": 0.1, "unit": ""},
        ],
        "equation": f"v₁ᶠ={v1f} m/s  v₂ᶠ={v2f} m/s  |  KE_i={KE_i}J  KE_f={KE_f}J",
    }


def _matter_pendulum(params: dict, question: str) -> dict:
    import math as _m
    L      = float(params.get("L", 2.5))
    g      = float(params.get("g", 9.8))
    theta0 = float(params.get("theta0", 40.0))
    mass   = float(params.get("m_mass", params.get("mass", 1.0)))
    T      = round(2 * _m.pi * _m.sqrt(L / g), 2)
    return {
        "supported": True,
        "domain": "pendulum",
        "physics": {"scenario": "pendulum", "initialParams": {"L": L, "theta0": theta0, "mass": mass, "g": g}},
        "params": [
            {"id": "L",      "label": "Length",    "value": L,      "min": 0.5, "max": 5,  "step": 0.25, "unit": "m"},
            {"id": "theta0", "label": "Angle θ₀",  "value": theta0, "min": 5,   "max": 85, "step": 5,    "unit": "°"},
            {"id": "mass",   "label": "Bob mass",  "value": mass,   "min": 0.5, "max": 5,  "step": 0.5,  "unit": "kg"},
        ],
        "equation": f"T = 2π√(L/g) = 2π√({L}/{g}) = {T} s",
    }


def _matter_projectile(params: dict, question: str) -> dict:
    import math as _m
    v0      = float(params.get("v0", 10.0))
    theta_d = float(params.get("theta0", 45.0))
    g       = float(params.get("g", 9.8))
    theta   = _m.radians(theta_d)
    R       = round(v0 ** 2 * _m.sin(2 * theta) / g, 1)
    H       = round(v0 ** 2 * _m.sin(theta) ** 2 / (2 * g), 1)
    T       = round(2 * v0 * _m.sin(theta) / g, 2)
    return {
        "supported": True,
        "domain": "projectile",
        "physics": {"scenario": "projectile", "initialParams": {"v0": v0, "theta0": theta_d, "g": g}},
        "params": [
            {"id": "v0",     "label": "Launch speed", "value": v0,      "min": 2,  "max": 25, "step": 1,  "unit": "m/s"},
            {"id": "theta0", "label": "Launch angle", "value": theta_d, "min": 10, "max": 80, "step": 5,  "unit": "°"},
        ],
        "equation": f"Range={R}m  H_max={H}m  Time={T}s",
    }


def _matter_spring(params: dict, question: str) -> dict:
    import math as _m
    k    = float(params.get("k", params.get("k_wave", 5.0)))
    mass = float(params.get("m_mass", params.get("mass", 2.0)))
    x0   = float(params.get("A", params.get("x0", 1.5)))
    om   = round(_m.sqrt(k / mass), 2)
    T    = round(2 * _m.pi / om, 2)
    return {
        "supported": True,
        "domain": "spring",
        "physics": {"scenario": "spring", "initialParams": {"k": k, "mass": mass, "x0": x0}},
        "params": [
            {"id": "k",    "label": "Spring constant", "value": k,    "min": 1,   "max": 30, "step": 1,    "unit": "N/m"},
            {"id": "mass", "label": "Mass",            "value": mass, "min": 0.5, "max": 8,  "step": 0.5,  "unit": "kg"},
            {"id": "x0",   "label": "Amplitude",       "value": x0,   "min": 0.5, "max": 3,  "step": 0.25, "unit": "m"},
        ],
        "equation": f"T = 2π√(m/k) = {T} s   ω = {om} rad/s",
    }


def _matter_incline(params: dict, question: str) -> dict:
    import math as _m
    angle = float(params.get("theta0", 30.0))
    mass  = float(params.get("m_mass", params.get("mass", 2.0)))
    mu    = float(params.get("mu", 0.2))
    g     = float(params.get("g", 9.8))
    th    = _m.radians(angle)
    a     = round(g * (_m.sin(th) - mu * _m.cos(th)), 2)
    return {
        "supported": True,
        "domain": "incline",
        "physics": {"scenario": "incline", "initialParams": {"angle": angle, "mass": mass, "friction": mu, "g": g}},
        "params": [
            {"id": "angle",    "label": "Slope angle", "value": angle, "min": 5,  "max": 75, "step": 5,   "unit": "°"},
            {"id": "mass",     "label": "Mass",        "value": mass,  "min": 0.5,"max": 10, "step": 0.5, "unit": "kg"},
            {"id": "friction", "label": "Friction μ",  "value": mu,    "min": 0,  "max": 0.8,"step": 0.05,"unit": ""},
        ],
        "equation": f"a = g(sinθ − μcosθ) = {g}(sin{angle}° − {mu}·cos{angle}°) = {a} m/s²",
    }


def _matter_circular(params: dict, question: str) -> dict:
    import math as _m
    r     = float(params.get("r", params.get("L", params.get("R", 1.5))))
    v0    = float(params.get("v0", 4.0))
    mass  = float(params.get("m_mass", params.get("mass", 1.0)))
    omega = round(v0 / r, 2) if r > 0 else 0
    T_per = round(2 * _m.pi * r / v0, 2) if v0 > 0 else 0
    ac    = round(v0 ** 2 / r, 2) if r > 0 else 0
    Fc    = round(mass * v0 ** 2 / r, 2) if r > 0 else 0
    return {
        "supported": True,
        "domain": "circular",
        "physics": {"scenario": "circular", "initialParams": {"r": r, "v0": v0, "mass": mass}},
        "params": [
            {"id": "r",    "label": "Radius",  "value": r,    "min": 0.5, "max": 4,  "step": 0.25, "unit": "m"},
            {"id": "v0",   "label": "Speed",   "value": v0,   "min": 1,   "max": 12, "step": 0.5,  "unit": "m/s"},
            {"id": "mass", "label": "Mass",    "value": mass, "min": 0.5, "max": 5,  "step": 0.5,  "unit": "kg"},
        ],
        "equation": f"aₒ = v²/r = {ac} m/s²   Fₒ = mv²/r = {Fc} N   T = {T_per} s   ω = {omega} rad/s",
    }


def _matter_pulley(params: dict, question: str) -> dict:
    m1  = float(params.get("m1", 10.0))
    m2  = float(params.get("m2", params.get("m_mass", 5.0)))
    g   = float(params.get("g", 9.8))
    den = m1 + m2 if (m1 + m2) > 0 else 1
    a   = round((m1 - m2) * g / den, 2)
    T   = round(2 * m1 * m2 * g / den, 2)
    return {
        "supported": True,
        "domain": "pulley",
        "physics": {"scenario": "pulley", "initialParams": {"m1": m1, "m2": m2, "g": g}},
        "params": [
            {"id": "m1", "label": "Mass 1 (left)",  "value": m1, "min": 1, "max": 20, "step": 0.5, "unit": "kg"},
            {"id": "m2", "label": "Mass 2 (right)", "value": m2, "min": 1, "max": 20, "step": 0.5, "unit": "kg"},
        ],
        "equation": f"a = (m₁−m₂)g/(m₁+m₂) = {a} m/s²   T = {T} N",
    }


def _matter_freefall(params: dict, question: str) -> dict:
    mass = float(params.get("m_mass", params.get("mass", 1.0)))
    g    = float(params.get("g", 9.8))
    drag = float(params.get("drag", 0.0))
    return {
        "supported": True,
        "domain": "freefall",
        "physics": {"scenario": "freefall", "initialParams": {"mass": mass, "g": g, "drag": drag}},
        "params": [
            {"id": "mass", "label": "Mass",          "value": mass, "min": 0.1, "max": 10, "step": 0.5,  "unit": "kg"},
            {"id": "drag", "label": "Air Resistance","value": drag, "min": 0,   "max": 0.1,"step": 0.005,"unit": ""},
        ],
        "equation": f"a = g = {g} m/s²  (free fall)",
    }


# Populate the dispatch table now that all builder functions are defined
_SCENE_DISPATCH.update({
    "force":      _matter_force,
    "collision":  _matter_collision,
    "pendulum":   _matter_pendulum,
    "projectile": _matter_projectile,
    "spring":     _matter_spring,
    "incline":    _matter_incline,
    "freefall":   _matter_freefall,
    "pulley":     _matter_pulley,
    "circular":   _matter_circular,
})
