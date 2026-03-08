"""
PhysiMate Learning Engine
─────────────────────────
Bridges PhysiMate's animation engine with a Bytewave-style adaptive learning loop:

  Skill Map → Choose Case → Assess (Q&A) → LLM Gap Analysis
      → Mastery Update → Netflix-style Recommendation Rows

Uses:
  • SQLite (stdlib) for per-student mastery/session persistence
  • Claude for question generation and answer evaluation
  • PhysiMate's /api/quick_render for remediation animations
"""

from __future__ import annotations

import json
import logging
import os
import random
import sqlite3
import time
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import anthropic
from dotenv import load_dotenv

load_dotenv(override=True)
logger = logging.getLogger(__name__)

# ── LLM client (same Anthropic endpoint as agent.py) ─────────────────────────
_client = anthropic.Anthropic(
    api_key=os.environ.get("ANTHROPIC_API_KEY", ""),
    timeout=60.0,
)
_CHAT_MODEL = "claude-haiku-4-5"

# ── Database ──────────────────────────────────────────────────────────────────
_DB_PATH = Path(__file__).resolve().parent / "learn.db"


@contextmanager
def _db():
    conn = sqlite3.connect(str(_DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with _db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS students (
                id   TEXT PRIMARY KEY,
                name TEXT DEFAULT 'Student',
                created_at REAL
            );
            CREATE TABLE IF NOT EXISTS mastery (
                student_id   TEXT,
                skill        TEXT,
                score        INTEGER DEFAULT 0,
                attempts     INTEGER DEFAULT 0,
                last_updated REAL,
                gaps         TEXT DEFAULT '[]',
                PRIMARY KEY (student_id, skill)
            );
            CREATE TABLE IF NOT EXISTS sessions (
                id           TEXT PRIMARY KEY,
                student_id   TEXT,
                skill        TEXT,
                case_id      TEXT,
                started_at   REAL,
                completed_at REAL,
                score        INTEGER
            );
            CREATE TABLE IF NOT EXISTS answers (
                id             TEXT PRIMARY KEY,
                session_id     TEXT,
                question_text  TEXT,
                student_answer TEXT,
                correct        INTEGER,
                gap_label      TEXT,
                feedback       TEXT
            );
            CREATE TABLE IF NOT EXISTS animations (
                id         TEXT PRIMARY KEY,
                question   TEXT NOT NULL,
                video_url  TEXT NOT NULL,
                quality    TEXT DEFAULT 'low',
                created_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS forum_posts (
                id         TEXT PRIMARY KEY,
                title      TEXT NOT NULL,
                body       TEXT NOT NULL,
                author     TEXT DEFAULT 'Student',
                tags       TEXT DEFAULT '[]',
                video_url  TEXT,
                upvotes    INTEGER DEFAULT 0,
                case_id    TEXT,
                created_at TEXT
            );
            CREATE TABLE IF NOT EXISTS forum_replies (
                id         TEXT PRIMARY KEY,
                post_id    TEXT NOT NULL REFERENCES forum_posts(id),
                author     TEXT DEFAULT 'Student',
                body       TEXT NOT NULL,
                upvotes    INTEGER DEFAULT 0,
                created_at TEXT
            );
            CREATE TABLE IF NOT EXISTS waitlist (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                email     TEXT UNIQUE NOT NULL,
                joined_at REAL NOT NULL
            );
        """)
    logger.info("Learning DB initialised at %s", _DB_PATH)


# ── Animation persistence ─────────────────────────────────────────────────────

def save_animation(question: str, video_url: str, quality: str = "low") -> str:
    """Persist a generated animation to the database. Returns the new animation id."""
    anim_id = str(uuid.uuid4())
    with _db() as conn:
        conn.execute(
            "INSERT INTO animations (id, question, video_url, quality, created_at) VALUES (?, ?, ?, ?, ?)",
            (anim_id, (question or "").strip()[:500], video_url, quality, time.time()),
        )
    logger.info("Animation saved: id=%s question=%s", anim_id, question[:60])
    return anim_id


def get_animations(limit: int = 100) -> list[dict]:
    """Return the most recent saved animations, newest first."""
    with _db() as conn:
        rows = conn.execute(
            "SELECT id, question, video_url, quality, created_at FROM animations "
            "ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [dict(r) for r in rows]


def delete_animation(anim_id: str) -> bool:
    """Delete a saved animation record. Returns True if a row was deleted."""
    with _db() as conn:
        cur = conn.execute("DELETE FROM animations WHERE id = ?", (anim_id,))
    return cur.rowcount > 0


def get_saved_video_urls() -> set[str]:
    """Return the set of all video_url values currently saved (for cleanup protection)."""
    with _db() as conn:
        rows = conn.execute("SELECT video_url FROM animations").fetchall()
    return {r["video_url"] for r in rows}


# ── Skills / Cases catalogue (aligned with Bytewave topic IDs) ───────────────

SKILLS: dict[str, dict] = {
    "motion": {
        "label": "Motion & Kinematics",
        "icon": "↗️",
        "description": "Position, velocity, acceleration, graphs and 2D motion",
        "cases": [
            {"id": "motion-1", "label": "Ball on a slope",
             "desc": "Acceleration on an inclined plane using equations of motion",
             "question": "A ball starts from rest and rolls down a 30° frictionless incline of length 5 m. (a) Find the component of g along the incline. (b) Time to reach the bottom. (c) Speed at the bottom. (g = 10 m/s²)",
             "hint": "a = g sin θ. Use s = ½at² and v = at."},
            {"id": "motion-2", "label": "Car braking distance",
             "desc": "Apply v² = u² + 2as for deceleration problems",
             "question": "A car at 90 km/h brakes with deceleration 5 m/s². (a) Convert 90 km/h to m/s. (b) Find stopping distance. (c) If the initial speed were doubled, by what factor does the stopping distance increase?",
             "hint": "v² = u² + 2as with v = 0. Stopping distance ∝ u²."},
            {"id": "motion-3", "label": "Projectile from a cliff",
             "desc": "2D projectile motion with separate horizontal and vertical analysis",
             "question": "A stone is thrown horizontally at 20 m/s from a 45 m cliff. (a) Time of flight. (b) Horizontal range. (c) Speed just before impact. (g = 10 m/s²)",
             "hint": "Vertical: h = ½gt². Horizontal: R = u_x × t. Final speed = √(v_x² + v_y²)."},
            {"id": "motion-4", "label": "Relative velocity in rain",
             "desc": "Vector addition for relative motion",
             "question": "Rain falls vertically at 10 m/s. A cyclist moves horizontally at 10 m/s. (a) At what angle should the cyclist tilt their umbrella? (b) What is the apparent speed of rain relative to the cyclist?",
             "hint": "Use vector addition: v_rel = √(v_rain² + v_cycle²). Angle = tan⁻¹(v_cycle/v_rain)."},
            {"id": "motion-5", "label": "Velocity–time graph analysis",
             "desc": "Extract acceleration and displacement from a v-t graph",
             "question": "A body's v-t graph: 0→2 s velocity rises linearly from 0 to 8 m/s; 2→5 s velocity stays at 8 m/s; 5→7 s velocity drops linearly to 0. (a) Acceleration in each phase. (b) Total displacement. (c) Average speed for the journey.",
             "hint": "Acceleration = slope. Displacement = area under the curve (triangles + rectangle)."},
            {"id": "motion-6", "label": "Projectile at an angle",
             "desc": "Oblique projectile — range, max height and time of flight",
             "question": "A ball is launched at 40 m/s at 60° to the horizontal. (a) Find the time of flight. (b) Maximum height. (c) Horizontal range. (g = 10 m/s²)",
             "hint": "T = 2u sinθ/g. H = u² sin²θ/(2g). R = u² sin2θ/g."},
        ],
    },
    "forces": {
        "label": "Forces & Newton's Laws",
        "icon": "⚖️",
        "description": "Forces and motion — Newton's three laws in real contexts",
        "cases": [
            {"id": "forces-1", "label": "Block on a rough incline",
             "desc": "Resolve forces along and perpendicular to an inclined plane with friction",
             "question": "A 5 kg block rests on a 30° incline (μ = 0.3). (a) Find the normal force. (b) Find the friction force. (c) Does the block slide? If yes, find the acceleration. (g = 10 m/s²)",
             "hint": "N = mg cosθ. f = μN. Compare mg sinθ with f to decide if it slides."},
            {"id": "forces-2", "label": "Atwood machine",
             "desc": "Connected masses over a frictionless pulley",
             "question": "Masses 4 kg and 6 kg hang on opposite sides of a light frictionless pulley. (a) Find the acceleration of the system. (b) Find the tension in the string. (g = 10 m/s²)",
             "hint": "a = (m₂ − m₁)g/(m₁ + m₂). T = m₁(g + a) or T = m₂(g − a)."},
            {"id": "forces-3", "label": "Elevator dynamics",
             "desc": "Apparent weight in an accelerating lift using Newton's 2nd law",
             "question": "A 70 kg person stands on a scale in a lift. (a) Reading when the lift accelerates up at 3 m/s². (b) Reading when it decelerates (going up) at 2 m/s². (c) Reading in free fall. (g = 10 m/s²)",
             "hint": "Scale reads the normal force N. N = m(g ± a). In free fall, a = g so N = 0."},
            {"id": "forces-4", "label": "Banked curve",
             "desc": "Circular motion on a banked road without friction",
             "question": "A car rounds a frictionless banked curve of radius 100 m banked at 30°. (a) Draw the free-body diagram. (b) Find the ideal speed for the car not to skid. (g = 10 m/s²)",
             "hint": "N sinθ provides centripetal force. N cosθ = mg. Divide to get v² = rg tanθ."},
            {"id": "forces-5", "label": "Two blocks and a string",
             "desc": "Newton's 2nd law applied to a system of connected blocks on a surface",
             "question": "Block A (3 kg) is on a frictionless table, connected by a string over a pulley to block B (2 kg) hanging off the edge. (a) Acceleration of the system. (b) Tension in the string. (g = 10 m/s²)",
             "hint": "System: m_B g = (m_A + m_B) × a. Then T = m_A × a."},
            {"id": "forces-6", "label": "Conical pendulum",
             "desc": "Horizontal circular motion of a pendulum bob",
             "question": "A 0.5 kg bob on a 1 m string moves in a horizontal circle. The string makes 30° with the vertical. (a) Find the tension. (b) Find the radius of the circle. (c) Find the speed of the bob. (g = 10 m/s²)",
             "hint": "T cosθ = mg (vertical). T sinθ = mv²/r (horizontal). r = L sinθ."},
        ],
    },
    "energy": {
        "label": "Work, Energy & Power",
        "icon": "⚡",
        "description": "Energy forms, conservation and power",
        "cases": [
            {"id": "energy-1", "label": "Rollercoaster loop",
             "desc": "Conservation of energy with minimum speed at the top of a loop",
             "question": "A 500 kg rollercoaster enters a vertical loop of radius 10 m. (a) Minimum speed at the top to maintain contact? (b) What height must the coaster start from (relative to the loop bottom) to achieve this? Ignore friction. (g = 10 m/s²)",
             "hint": "At top: mg = mv²/r → v² = rg. Then use energy conservation: mgh = mg(2r) + ½mv²."},
            {"id": "energy-2", "label": "Work by a variable force",
             "desc": "Calculate work done from a force-displacement graph or F(x)",
             "question": "A force F = 6x (in N) acts on a 2 kg body. (a) Work done as x goes from 0 to 4 m. (b) Speed at x = 4 m if it starts from rest. (c) Average force over this displacement.",
             "hint": "W = ∫F dx = ∫6x dx = 3x². Use work-energy theorem: W = ½mv². Average F = W/d."},
            {"id": "energy-3", "label": "Spring launcher",
             "desc": "Elastic PE converts to kinetic energy",
             "question": "A spring (k = 800 N/m) is compressed 0.15 m and launches a 0.2 kg ball vertically. (a) Speed at the moment of release. (b) Maximum height reached. Ignore air resistance. (g = 10 m/s²)",
             "hint": "½kx² = ½mv² for speed. Then ½mv² = mgh for height."},
            {"id": "energy-4", "label": "Head-on collision",
             "desc": "Perfectly inelastic collision — momentum conservation and KE loss",
             "question": "A 2 kg ball at 6 m/s collides head-on with a 3 kg ball at rest. They stick together. (a) Final velocity. (b) KE before and after. (c) Fraction of KE lost.",
             "hint": "Momentum is conserved: m₁u₁ = (m₁+m₂)v. Calculate KE = ½mv² before and after."},
            {"id": "energy-5", "label": "Power on an incline",
             "desc": "Calculate instantaneous power against gravity on a slope",
             "question": "A 1200 kg car climbs a 5° slope at constant 20 m/s. Road friction is 400 N. (a) Component of weight along the slope. (b) Total resistive force. (c) Engine power required. (g = 10 m/s²)",
             "hint": "F_gravity = mg sinθ. Total F = F_gravity + friction. P = Fv."},
        ],
    },
    "waves": {
        "label": "Waves & Sound",
        "icon": "〰️",
        "description": "Transverse and longitudinal waves, frequency and sound",
        "cases": [
            {"id": "waves-1", "label": "Ripple tank",
             "desc": "Measure wavelength and frequency to find wave speed",
             "question": "Water waves have frequency 5 Hz and wavelength 4 cm. (a) Calculate wave speed. (b) If the wave enters a shallow region and speed halves, what is the new wavelength? Does frequency change?",
             "hint": "v = fλ. Frequency stays constant during refraction — so new λ = v_new/f."},
            {"id": "waves-2", "label": "Doppler effect — ambulance",
             "desc": "Frequency shift due to source motion",
             "question": "An ambulance siren emits 800 Hz. It approaches at 30 m/s. Speed of sound = 340 m/s. (a) Observed frequency as it approaches. (b) Observed frequency as it recedes. (c) What is the beat frequency at the instant it passes?",
             "hint": "f' = f × v/(v ∓ v_s). Use − when approaching, + when receding."},
            {"id": "waves-3", "label": "Standing waves on a string",
             "desc": "Harmonics, nodes and antinodes on a fixed string",
             "question": "A 1.2 m string fixed at both ends vibrates in its 3rd harmonic at 450 Hz. (a) How many nodes and antinodes? (b) Wavelength. (c) Wave speed. (d) Fundamental frequency.",
             "hint": "3rd harmonic: L = 3λ/2. Nodes = n+1, antinodes = n. v = fλ. f₁ = f₃/3."},
            {"id": "waves-4", "label": "Open organ pipe",
             "desc": "Resonance frequencies in an open pipe",
             "question": "An open pipe of length 0.85 m resonates in air (v = 340 m/s). (a) Fundamental frequency. (b) Frequency of the 3rd harmonic. (c) If one end is now closed, what is the new fundamental?",
             "hint": "Open pipe: f₁ = v/(2L). Closed pipe: f₁ = v/(4L). Only odd harmonics for closed."},
            {"id": "waves-5", "label": "Beats between tuning forks",
             "desc": "Superposition producing beats — find unknown frequency",
             "question": "Two tuning forks are struck together. Fork A = 256 Hz. 4 beats/s are heard. When fork B is loaded with wax, beats drop to 2/s. (a) Possible frequencies of fork B? (b) Which one is correct after wax is added? Explain.",
             "hint": "Beat frequency = |f_A − f_B|. Wax lowers f_B. If beats decrease, f_B was above f_A."},
        ],
    },
    "light": {
        "label": "Light & Optics",
        "icon": "💡",
        "description": "Refraction, lenses, mirrors and wave optics",
        "cases": [
            {"id": "light-1", "label": "Glass prism — minimum deviation",
             "desc": "Apply Snell's law and find minimum deviation angle",
             "question": "A 60° prism has refractive index 1.5. (a) Find the angle of minimum deviation using μ = sin((A+D_m)/2) / sin(A/2). (b) Angle of incidence at minimum deviation.",
             "hint": "sin((60+D_m)/2) = 1.5 × sin 30° = 0.75. D_m = 2 sin⁻¹(0.75) − 60°. At min deviation, i = (A+D_m)/2."},
            {"id": "light-2", "label": "Converging lens image",
             "desc": "Use the thin lens equation 1/f = 1/v − 1/u",
             "question": "An object is placed 30 cm from a convex lens of focal length 20 cm. (a) Find the image distance. (b) Magnification. (c) Is the image real or virtual, upright or inverted?",
             "hint": "1/v − 1/u = 1/f. Use sign convention: u = −30 cm, f = +20 cm. m = v/u."},
            {"id": "light-3", "label": "Total internal reflection",
             "desc": "Critical angle and conditions for TIR",
             "question": "Light travels from glass (n = 1.5) to water (n = 1.33). (a) Calculate the critical angle. (b) If the angle of incidence is 70°, does TIR occur? (c) What if the light goes from glass to air instead?",
             "hint": "sin(c) = n₂/n₁ (for n₁ > n₂). TIR occurs when θ_i > c."},
            {"id": "light-4", "label": "Young's double slit",
             "desc": "Interference fringe spacing and path difference",
             "question": "In YDSE, slit separation d = 0.5 mm, screen distance D = 1.5 m, λ = 600 nm. (a) Fringe width. (b) Distance of the 3rd bright fringe from the centre. (c) What happens to fringe width if d is doubled?",
             "hint": "β = λD/d. Position of nth bright fringe = nβ. Fringe width ∝ 1/d."},
            {"id": "light-5", "label": "Concave mirror",
             "desc": "Mirror formula and ray diagrams for curved mirrors",
             "question": "An object is placed 15 cm from a concave mirror of focal length 10 cm. (a) Find the image position using 1/v + 1/u = 1/f. (b) Magnification. (c) If the object moves to the focal point, describe the image.",
             "hint": "u = −15, f = −10 (concave). At focus, reflected rays are parallel → image at infinity."},
        ],
    },
    "electricity": {
        "label": "Electricity & Circuits",
        "icon": "🔌",
        "description": "Charges, fields and circuits",
        "cases": [
            {"id": "elec-1", "label": "EMF and internal resistance",
             "desc": "Distinguish between EMF and terminal voltage",
             "question": "A battery has EMF 12 V and internal resistance 0.5 Ω connected to a 5.5 Ω resistor. (a) Current in the circuit. (b) Terminal voltage. (c) Power dissipated internally.",
             "hint": "I = EMF/(R + r). V_terminal = EMF − Ir. P_internal = I²r."},
            {"id": "elec-2", "label": "Wheatstone bridge",
             "desc": "Balanced bridge condition and unknown resistance",
             "question": "A Wheatstone bridge has R₁ = 100 Ω, R₂ = 200 Ω, R₃ = 150 Ω. (a) Find R₄ for a balanced bridge. (b) If the galvanometer shows zero deflection, what is the current through it? (c) What happens if R₃ changes to 160 Ω?",
             "hint": "Balanced when R₁/R₂ = R₃/R₄. Zero current through galvanometer when balanced."},
            {"id": "elec-3", "label": "Kirchhoff's loop analysis",
             "desc": "Apply KVL and KCJ to a two-loop circuit",
             "question": "Two batteries (10 V, 6 V) and three resistors (2 Ω, 4 Ω, 3 Ω) form a circuit. The 10 V battery is in series with 2 Ω and 4 Ω. The 6 V battery connects across the 4 Ω with a 3 Ω. Find the current through each resistor using Kirchhoff's laws.",
             "hint": "Set up loop equations: ΣV = 0 around each loop. Use KCJ at the junction."},
            {"id": "elec-4", "label": "Capacitors in combination",
             "desc": "Series and parallel capacitor networks, energy stored",
             "question": "Three capacitors: 2 μF, 3 μF, 6 μF. The 3 μF and 6 μF are in parallel, and that combination is in series with the 2 μF. (a) Total capacitance. (b) Charge on the 2 μF if connected to 12 V. (c) Total energy stored.",
             "hint": "Parallel: C_p = 3+6 = 9 μF. Series: 1/C = 1/2 + 1/9. Q = CV. E = ½CV²."},
            {"id": "elec-5", "label": "RC circuit charging",
             "desc": "Time constant and voltage across a charging capacitor",
             "question": "A 10 μF capacitor charges through a 100 kΩ resistor from a 9 V supply. (a) Time constant τ. (b) Voltage across the capacitor at t = τ. (c) Time to reach approximately 99% of 9 V.",
             "hint": "τ = RC. V(t) = V₀(1 − e^(−t/τ)). At t = τ, V ≈ 0.63 V₀. 99% at t ≈ 5τ."},
        ],
    },
    "magnetism": {
        "label": "Magnetism & EMI",
        "icon": "🧲",
        "description": "Magnetic fields, forces on conductors and electromagnetic induction",
        "cases": [
            {"id": "mag-1", "label": "Solenoid field",
             "desc": "Calculate field inside a current-carrying solenoid using B = μ₀nI",
             "question": "A solenoid has 500 turns, length 0.25 m, current 2 A. (a) Turns per metre. (b) Magnetic field inside. (c) If an iron core (μ_r = 200) is inserted, what is the new field? (μ₀ = 4π × 10⁻⁷ T·m/A)",
             "hint": "n = N/L. B = μ₀nI. With core: B = μ₀μ_r nI."},
            {"id": "mag-2", "label": "Force on a current-carrying wire",
             "desc": "F = BIL sinθ and Fleming's left-hand rule",
             "question": "A 0.5 m wire carries 4 A at 60° to a 0.2 T field. (a) Force on the wire. (b) At what angle is the force maximum? (c) Use Fleming's LHR to find the force direction if B is north and I is east.",
             "hint": "F = BIL sinθ. Max when θ = 90°. LHR: index = B, middle = I, thumb = F."},
            {"id": "mag-3", "label": "Charged particle in a magnetic field",
             "desc": "Radius and period of circular motion for a charged particle",
             "question": "A proton (m = 1.67 × 10⁻²⁷ kg, q = 1.6 × 10⁻¹⁹ C) enters a 0.5 T field at 2 × 10⁶ m/s perpendicular to B. (a) Radius of circular path. (b) Time period. (c) What changes if the speed doubles?",
             "hint": "r = mv/(qB). T = 2πm/(qB). Note: T is independent of speed."},
            {"id": "mag-4", "label": "Faraday's law — moving rod",
             "desc": "EMF induced in a rod moving through a magnetic field",
             "question": "A 0.4 m conducting rod moves at 5 m/s perpendicular to a 0.3 T field. (a) Induced EMF. (b) If the rod is part of a circuit with 2 Ω resistance, find the current. (c) Force needed to maintain constant speed.",
             "hint": "EMF = BLv. I = EMF/R. Force = BIL (opposing motion by Lenz's law)."},
            {"id": "mag-5", "label": "Force between parallel wires",
             "desc": "Magnetic interaction between two long parallel current-carrying wires",
             "question": "Two parallel wires 10 cm apart carry 5 A and 8 A in the same direction. (a) Force per unit length between them. (b) Attractive or repulsive? (c) What happens if one current is reversed? (μ₀ = 4π × 10⁻⁷)",
             "hint": "F/L = μ₀I₁I₂/(2πd). Same direction → attract. Opposite → repel."},
        ],
    },
    "heat": {
        "label": "Heat & Thermodynamics",
        "icon": "🌡️",
        "description": "Calorimetry, gas laws and thermodynamic processes",
        "cases": [
            {"id": "heat-1", "label": "Calorimetry — mixing liquids",
             "desc": "Heat gained = heat lost in a mixture reaching thermal equilibrium",
             "question": "200 g of water at 80°C is mixed with 300 g of water at 20°C in an insulated container. (a) Final temperature. (b) If 100 g of copper (c = 400 J/(kg·°C)) at 200°C is dropped in instead of hot water, find the equilibrium temperature. c_water = 4200 J/(kg·°C).",
             "hint": "m₁cΔT₁ = m₂cΔT₂. For mixed materials: m_Cu × c_Cu × ΔT_Cu = m_w × c_w × ΔT_w."},
            {"id": "heat-2", "label": "Ideal gas law",
             "desc": "PV = nRT applied to changes of state",
             "question": "2 moles of ideal gas at 300 K and 1 atm. (a) Volume (R = 8.314 J/(mol·K), 1 atm = 1.013 × 10⁵ Pa). (b) If heated to 600 K at constant pressure, new volume. (c) If the gas is then compressed isothermally to half the volume, new pressure.",
             "hint": "V = nRT/P. At constant P: V₁/T₁ = V₂/T₂. Isothermal: P₁V₁ = P₂V₂."},
            {"id": "heat-3", "label": "First law of thermodynamics",
             "desc": "ΔU = Q − W for various thermodynamic processes",
             "question": "An ideal gas absorbs 500 J of heat and does 200 J of work. (a) Change in internal energy. (b) If the process were adiabatic, and the gas does 200 J of work, what is ΔU? (c) In a free expansion, what are Q, W and ΔU?",
             "hint": "ΔU = Q − W. Adiabatic: Q = 0. Free expansion: W = 0, Q = 0 for ideal gas."},
            {"id": "heat-4", "label": "Latent heat and phase change",
             "desc": "Energy for change of state including the heating curve",
             "question": "500 g of ice at −10°C is heated until it becomes steam at 100°C. c_ice = 2100 J/(kg·°C), L_fusion = 334 kJ/kg, c_water = 4200 J/(kg·°C), L_vap = 2260 kJ/kg. Calculate the total energy required, breaking it into each stage.",
             "hint": "Four stages: heat ice → 0°C, melt, heat water → 100°C, vaporise. Sum all Q values."},
            {"id": "heat-5", "label": "Carnot engine efficiency",
             "desc": "Maximum efficiency of a heat engine between two reservoirs",
             "question": "A heat engine operates between 600 K and 300 K. (a) Carnot efficiency. (b) If the engine absorbs 1000 J per cycle, max work output. (c) Heat rejected per cycle. (d) How does the efficiency change if the cold reservoir drops to 200 K?",
             "hint": "η = 1 − T_cold/T_hot. W = ηQ_hot. Q_cold = Q_hot − W."},
        ],
    },
    "gravity": {
        "label": "Gravity & Orbits",
        "icon": "🌍",
        "description": "Gravitational force, field, potential and orbital mechanics",
        "cases": [
            {"id": "grav-1", "label": "Free fall from height",
             "desc": "Kinematics under constant gravitational acceleration",
             "question": "A stone drops from rest off an 80 m cliff. (a) Time to reach the ground. (b) Speed just before it hits. (c) At what height is its speed half of the final speed? (g = 10 m/s²)",
             "hint": "h = ½gt². v = gt. For (c), use v² = 2g(80 − h') with v = v_final/2."},
            {"id": "grav-2", "label": "Satellite orbit",
             "desc": "Orbital speed, period and energy of a satellite",
             "question": "A satellite orbits 400 km above Earth. R = 6400 km, M = 6 × 10²⁴ kg, G = 6.67 × 10⁻¹¹. (a) Orbital speed. (b) Time period. (c) Total orbital energy.",
             "hint": "v = √(GM/r) where r = R + h. T = 2πr/v. E = −GMm/(2r)."},
            {"id": "grav-3", "label": "Escape velocity",
             "desc": "Minimum speed to leave a planet's gravitational field",
             "question": "For Earth (M = 6 × 10²⁴ kg, R = 6.4 × 10⁶ m, G = 6.67 × 10⁻¹¹): (a) Derive the escape velocity formula. (b) Calculate v_escape. (c) If a planet has twice the mass and half the radius of Earth, what is its escape velocity?",
             "hint": "Set KE = −PE: ½mv² = GMm/R → v = √(2GM/R). v_escape ∝ √(M/R)."},
            {"id": "grav-4", "label": "Variation of g with altitude and depth",
             "desc": "How gravitational acceleration changes above and below Earth's surface",
             "question": "g₀ = 10 m/s² at Earth's surface, R = 6400 km. (a) g at height R above the surface. (b) g at depth R/2 below the surface. (c) At what height above the surface is g = g₀/4?",
             "hint": "Above: g = g₀R²/(R+h)². Below: g = g₀(1 − d/R). For (c): (R+h)² = 4R²."},
            {"id": "grav-5", "label": "Kepler's third law",
             "desc": "Relationship between orbital period and radius",
             "question": "The Moon orbits Earth at 3.84 × 10⁸ m with period 27.3 days. A new satellite orbits at 4.22 × 10⁷ m. (a) Use T² ∝ r³ to find the satellite's period. (b) Is this a geostationary orbit? (c) What orbital radius gives a 24-hour period?",
             "hint": "T₁²/r₁³ = T₂²/r₂³. Solve for T₂. Geostationary = 24 h at the equator."},
        ],
    },
    "quantum": {
        "label": "Atoms & Nuclei",
        "icon": "⚛️",
        "description": "Atomic structure, photoelectric effect, nuclear decay and energy levels",
        "cases": [
            {"id": "atom-1", "label": "Bohr model — hydrogen spectrum",
             "desc": "Energy levels, transition wavelengths and the Rydberg formula",
             "question": "For hydrogen, E_n = −13.6/n² eV. (a) Energy of n = 1, 2, 3 levels. (b) Wavelength emitted in the n = 3 → n = 2 transition. (c) Which series does this belong to? (1 eV = 1.6 × 10⁻¹⁹ J, h = 6.63 × 10⁻³⁴, c = 3 × 10⁸)",
             "hint": "ΔE = E_3 − E_2. λ = hc/ΔE. The n = 2 final level → Balmer series (visible)."},
            {"id": "atom-2", "label": "Photoelectric effect",
             "desc": "Threshold frequency, work function and stopping potential",
             "question": "A metal has work function 2.0 eV. Light of wavelength 400 nm falls on it. (a) Energy of each photon. (b) Maximum KE of emitted electrons. (c) Stopping potential. (h = 6.63 × 10⁻³⁴ J·s, c = 3 × 10⁸ m/s, 1 eV = 1.6 × 10⁻¹⁹ J)",
             "hint": "E = hc/λ. KE_max = E − φ. Stopping potential V₀ = KE_max/e."},
            {"id": "atom-3", "label": "Half-life and decay",
             "desc": "Radioactive decay law and half-life calculations",
             "question": "A sample has initial activity 6400 Bq and half-life 8 hours. (a) Activity after 32 hours. (b) Time for activity to drop below 50 Bq. (c) If 10⁶ atoms are present initially, how many remain after 24 hours?",
             "hint": "A = A₀(½)^(t/T). N = N₀(½)^(t/T). 32 h = 4 half-lives."},
            {"id": "atom-4", "label": "Nuclear binding energy",
             "desc": "Mass defect and binding energy per nucleon",
             "question": "He-4 nucleus: 2 protons (1.0073 u each) + 2 neutrons (1.0087 u each). Measured mass = 4.0026 u. (a) Mass defect. (b) Binding energy in MeV (1 u = 931.5 MeV/c²). (c) Binding energy per nucleon. (d) Why is this relevant to nuclear stability?",
             "hint": "Δm = (2×1.0073 + 2×1.0087) − 4.0026. BE = Δm × 931.5. BE/A = BE/4."},
            {"id": "atom-5", "label": "de Broglie wavelength",
             "desc": "Matter wave wavelength for electrons and macroscopic objects",
             "question": "An electron is accelerated through 100 V. (a) Its kinetic energy. (b) Its de Broglie wavelength. (c) Calculate the de Broglie wavelength of a 0.05 kg ball at 20 m/s. Why is wave nature negligible for the ball? (h = 6.63 × 10⁻³⁴, m_e = 9.1 × 10⁻³¹ kg)",
             "hint": "KE = eV. λ = h/p = h/√(2mKE). For the ball, λ is astronomically small."},
        ],
    },
}

# Flat case ID → (skill_id, case_dict) lookup for O(1) retrieval
_CASE_LOOKUP: dict[str, tuple[str, dict]] = {
    c["id"]: (sid, c)
    for sid, skill in SKILLS.items()
    for c in skill["cases"]
}

# Maps case_id → a PhysiMate question that generates a good remediation animation
_REMEDIATION_PROMPTS: dict[str, str] = {
    # Motion & Kinematics
    "motion-1": "Show a ball accelerating down a frictionless incline at 30 degrees. Label the component g sin theta, velocity and displacement.",
    "motion-2": "Show a car decelerating to rest. Label initial speed, deceleration and stopping distance. Show that stopping distance is proportional to u squared.",
    "motion-3": "Show projectile motion from a cliff with horizontal launch. Separate horizontal and vertical components. Label range and time of flight.",
    "motion-4": "Show rain falling vertically and a cyclist moving horizontally. Draw the relative velocity vector triangle with the resultant and the umbrella angle.",
    "motion-5": "Show a velocity-time graph with three phases: constant acceleration, constant velocity, and deceleration. Label area under each section as displacement.",
    "motion-6": "Show oblique projectile motion at 60 degrees. Label the trajectory, maximum height, range and time of flight with formulas.",
    # Forces & Newton's Laws
    "forces-1": "Show a block on a rough inclined plane. Resolve weight into components along and perpendicular to the incline. Label normal force, friction and net force.",
    "forces-2": "Show an Atwood machine with two unequal masses over a pulley. Label tension, weights and the direction of acceleration.",
    "forces-3": "Show a person standing on a scale in an accelerating lift. Label weight mg, normal force N and net force. Show N changes with acceleration direction.",
    "forces-4": "Show a car on a banked curve. Resolve the normal force into vertical and horizontal (centripetal) components. Label angle, radius and ideal speed.",
    "forces-5": "Show two blocks connected by a string over a pulley at the edge of a table. Label tension, weight of the hanging block and acceleration of the system.",
    "forces-6": "Show a conical pendulum. Label the tension along the string, its vertical and horizontal components, the radius and the angle with vertical.",
    # Work, Energy & Power
    "energy-1": "Show a rollercoaster entering a vertical loop. Label PE at the top, KE at the bottom, and the minimum speed condition mg = mv squared over r at the loop top.",
    "energy-2": "Show a Force vs displacement graph for F = 6x. Shade the area under the curve as work done. Show the work-energy theorem: W = half mv squared.",
    "energy-3": "Show a compressed spring launching a ball vertically. Label spring PE = half k x squared converting to KE then to gravitational PE = mgh at max height.",
    "energy-4": "Show two balls colliding and sticking together (perfectly inelastic). Label momentum before and after. Show KE bars showing energy lost.",
    "energy-5": "Show a car climbing a slope at constant speed. Label the forces: engine force, gravity component mg sin theta, friction. Show Power = Force times velocity.",
    # Waves & Sound
    "waves-1":  "Show a transverse wave entering a shallow region. Label wavelength decreasing while frequency stays constant. Show v = f lambda.",
    "waves-2":  "Show the Doppler effect for a moving ambulance. Show compressed wavefronts ahead and stretched wavefronts behind. Label frequencies.",
    "waves-3":  "Show a string vibrating in its 3rd harmonic. Label nodes, antinodes, wavelength = 2L/3. Show fundamental alongside for comparison.",
    "waves-4":  "Show an open organ pipe with displacement nodes/antinodes for the fundamental and 3rd harmonic. Then show a closed pipe fundamental for comparison.",
    "waves-5":  "Show two waves of slightly different frequencies superimposing to produce beats. Label the beat frequency as the difference of the two.",
    # Light & Optics
    "light-1":  "Show a light ray passing through a 60 degree prism at minimum deviation. Label angle of incidence, emergence and the deviation angle.",
    "light-2":  "Show ray diagram for a convex lens with object beyond 2F. Label object distance u, image distance v, focal length f and the image.",
    "light-3":  "Show light going from glass to water and glass to air. Label critical angles for each case. Show TIR occurring when incidence exceeds critical angle.",
    "light-4":  "Show Young's double slit setup. Draw coherent waves from two slits interfering on the screen. Label fringe width beta = lambda D over d.",
    "light-5":  "Show ray diagram for a concave mirror with object between C and F. Label object, real inverted image, focal point and centre of curvature.",
    # Electricity & Circuits
    "elec-1":   "Show a circuit with a battery (EMF and internal resistance r) connected to external resistance R. Label terminal voltage V = EMF minus Ir.",
    "elec-2":   "Show a Wheatstone bridge circuit with four resistors. Label the balance condition R1/R2 = R3/R4 and the galvanometer reading zero.",
    "elec-3":   "Show a two-loop circuit. Mark the direction of currents. Write Kirchhoff's voltage law for each loop and current law at the junction.",
    "elec-4":   "Show capacitors in a series-parallel network. Calculate step by step: parallel combination first, then series. Label charge and energy stored.",
    "elec-5":   "Show voltage across a capacitor vs time during charging through a resistor. Label the time constant tau = RC, 63% and 99% markers.",
    # Magnetism & EMI
    "mag-1":    "Show the magnetic field inside a solenoid using B = mu_0 n I. Show the field becoming stronger when an iron core is inserted.",
    "mag-2":    "Show a current-carrying wire in a uniform magnetic field at angle theta. Label F = BIL sin theta. Show maximum force at 90 degrees.",
    "mag-3":    "Show a charged particle (proton) moving in a circle in a magnetic field. Label radius r = mv over qB and show the period is independent of speed.",
    "mag-4":    "Show a conducting rod sliding on rails in a magnetic field. Label induced EMF = BLv, current direction by Lenz's law, and the retarding force.",
    "mag-5":    "Show two parallel wires with currents. Draw the magnetic field from each wire at the location of the other. Show attractive force for same-direction currents.",
    # Heat & Thermodynamics
    "heat-1":   "Show a calorimetry setup where hot and cold water mix. Label heat lost = heat gained and show the equilibrium temperature calculation.",
    "heat-2":   "Show a PV diagram with isothermal and isobaric processes. Label PV = nRT and show how volume changes with temperature at constant pressure.",
    "heat-3":   "Show the first law of thermodynamics Q = delta U + W for three processes: isothermal, adiabatic and free expansion. Label Q, W, delta U for each.",
    "heat-4":   "Show a complete heating curve from ice at minus 10 C to steam at 100 C. Label each stage: warming ice, melting, warming water, boiling. Show energy for each.",
    "heat-5":   "Show a Carnot cycle on a PV diagram with two isotherms and two adiabats. Label efficiency eta = 1 minus T cold over T hot.",
    # Gravity & Orbits
    "grav-1":   "Show free fall with increasing velocity under gravity. Label g = 10 m/s squared, v = gt, and h = half g t squared.",
    "grav-2":   "Show a satellite in circular orbit. Label orbital speed v = sqrt GM over r, period T = 2 pi r over v, and total energy E = minus GMm over 2r.",
    "grav-3":   "Show the escape velocity derivation: KE = PE at infinity. Label v_escape = sqrt 2GM over R. Compare with orbital speed.",
    "grav-4":   "Show a graph of g vs distance from Earth's centre. g increases linearly below the surface, then falls as 1 over r squared above.",
    "grav-5":   "Show Kepler's third law: T squared proportional to r cubed. Draw two orbits at different radii and label their periods.",
    # Atoms & Nuclei
    "atom-1":   "Show hydrogen energy levels n = 1, 2, 3, 4. Draw transitions for Lyman, Balmer and Paschen series. Label the wavelength formula.",
    "atom-2":   "Show the photoelectric effect setup. Label incident photon energy hf, work function phi, and max KE of emitted electrons. Show threshold frequency.",
    "atom-3":   "Show an exponential radioactive decay curve. Label half-life intervals, activity at each, and the equation A = A_0 times half to the power t over T.",
    "atom-4":   "Show a binding energy per nucleon vs mass number graph. Label the peak at iron-56. Explain why fusion (light nuclei) and fission (heavy nuclei) both release energy.",
    "atom-5":   "Show an electron being accelerated through a potential difference. Label its de Broglie wavelength lambda = h over p = h over sqrt 2meV.",
}


# ── Student management ────────────────────────────────────────────────────────

def get_or_create_student(student_id: str, name: str = "Student") -> dict:
    with _db() as conn:
        row = conn.execute("SELECT * FROM students WHERE id=?", (student_id,)).fetchone()
        if row:
            return dict(row)
        conn.execute(
            "INSERT INTO students (id, name, created_at) VALUES (?,?,?)",
            (student_id, name, time.time()),
        )
        return {"id": student_id, "name": name, "created_at": time.time()}


# ── Mastery helpers ───────────────────────────────────────────────────────────

def get_mastery(student_id: str) -> dict[str, dict]:
    """Return {skill: {score, attempts, gaps, last_updated}} for a student."""
    with _db() as conn:
        rows = conn.execute(
            "SELECT * FROM mastery WHERE student_id=?", (student_id,)
        ).fetchall()
    result: dict[str, dict] = {}
    for row in rows:
        result[row["skill"]] = {
            "score": row["score"],
            "attempts": row["attempts"],
            "gaps": json.loads(row["gaps"] or "[]"),
            "last_updated": row["last_updated"],
        }
    return result


def _update_mastery(student_id: str, skill: str, overall_score: int, delta: int, new_gaps: list[str]):
    _DECAY_PER_DAY = 0.85
    target_qs = len(SKILLS.get(skill, {}).get("cases", [])) * 3 or 9

    with _db() as conn:
        rows = conn.execute(
            """SELECT a.correct, s.completed_at
               FROM answers a
               JOIN sessions s ON a.session_id = s.id
               WHERE s.student_id=? AND s.skill=? AND s.completed_at IS NOT NULL""",
            (student_id, skill),
        ).fetchall()

        now = time.time()
        w_correct = 0.0
        w_total   = 0.0
        for r in rows:
            days_ago = max((now - r["completed_at"]) / 86400, 0)
            w = _DECAY_PER_DAY ** days_ago
            w_correct += w * (1 if r["correct"] else 0)
            w_total   += w

        n = len(rows)
        accuracy   = (w_correct / w_total) if w_total > 0 else 0
        confidence = min(1.0, n / target_qs)
        new_score  = max(0, min(100, round(accuracy * 100 * confidence)))

        existing = conn.execute(
            "SELECT * FROM mastery WHERE student_id=? AND skill=?",
            (student_id, skill),
        ).fetchone()

        if existing:
            old_gaps = json.loads(existing["gaps"] or "[]")
            merged = list(dict.fromkeys(new_gaps + old_gaps))[:10]
            if new_score >= 70 and existing["score"] < 70:
                merged = new_gaps[:10]
            conn.execute(
                """UPDATE mastery
                   SET score=?, attempts=attempts+1, last_updated=?, gaps=?
                   WHERE student_id=? AND skill=?""",
                (new_score, time.time(), json.dumps(merged), student_id, skill),
            )
        else:
            conn.execute(
                """INSERT INTO mastery (student_id, skill, score, attempts, last_updated, gaps)
                   VALUES (?,?,?,1,?,?)""",
                (student_id, skill, new_score, time.time(), json.dumps(new_gaps[:10])),
            )


# ── Question generation ───────────────────────────────────────────────────────

def generate_questions(skill: str, case_id: str, mastery_score: int) -> list[dict]:
    """
    Ask the LLM to generate 3 MCQ questions for the given skill/case.
    Difficulty adapts to mastery score (0=beginner, 100=expert).
    """
    skill_label = SKILLS.get(skill, {}).get("label", skill)
    case_obj = next(
        (c for c in SKILLS.get(skill, {}).get("cases", []) if c["id"] == case_id), {}
    )
    case_label = case_obj.get("label", case_id)
    case_desc  = case_obj.get("desc", "")
    difficulty = _difficulty_tier(mastery_score)

    prompt = f"""You are a competitive physics exam question writer at JEE level.

Generate EXACTLY 3 multiple-choice questions (MCQs) for:
  Topic: {skill_label}
  Sub-topic: {case_label} — {case_desc}
  Difficulty: {difficulty}
  Student mastery: {mastery_score}%

STRICT RULES:
1. DIVERSITY: Each question MUST test a DIFFERENT sub-concept. Never repeat the same formula or scenario.
2. NUMERICAL: Every question must include specific numerical values. No purely qualitative questions.
3. OPTIONS: Each question has EXACTLY 4 options (A–D). Exactly ONE is correct.
4. DISTRACTORS: Wrong options must come from specific, realistic mistakes (wrong formula, sign error, missing factor, forgetting a component). NOT random numbers.
5. Shuffle the correct answer position across questions — don't always use the same letter.
6. Return ONLY valid JSON — no markdown, no extra text.

Return this exact JSON array:
[
  {{
    "question": "<full question text with numerical values and units>",
    "options": {{"A": "...", "B": "...", "C": "...", "D": "..."}},
    "correct_option": "<A/B/C/D>",
    "hint": "<one-sentence conceptual hint>",
    "explanation": "<worked solution + why distractors are wrong>",
    "misconception": "<the specific wrong approach leading to a distractor>"
  }},
  ... (exactly 3 objects)
]"""

    try:
        resp = _client.messages.create(
            model=_CHAT_MODEL,
            max_tokens=2000,
            temperature=0.65,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = resp.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        questions = json.loads(raw)
        if isinstance(questions, list) and len(questions) >= 1:
            return questions[:3]
    except Exception as e:
        logger.error("Question generation failed: %s", e)

    return _fallback_questions(skill, case_id)


def _fallback_questions(skill: str, case_id: str) -> list[dict]:
    """Topic-specific MCQ fallbacks used when LLM generation fails."""
    _by_skill: dict[str, list[dict]] = {
        "motion": [
            {
                "question": "A particle moves with v = (3t² − 6t) m/s. Find the total distance travelled in the first 3 seconds.",
                "options": {"A": "8 m", "B": "0 m", "C": "4 m", "D": "12 m"},
                "correct_option": "A",
                "hint": "v = 0 at t = 0 and t = 2 (velocity changes sign). Integrate |v| separately on 0→2 and 2→3.",
                "explanation": "∫₀²(3t²−6t)dt = [t³−3t²]₀² = −4 m (backward). ∫₂³(3t²−6t)dt = [t³−3t²]₂³ = 0−(−4) = +4 m. Distance = |−4| + 4 = 8 m. B is the net displacement (the particle returns to the start). C counts only one interval. D doubles without justification.",
                "misconception": "Computing net displacement instead of total distance — missing that the particle reverses at t = 2 s.",
            },
            {
                "question": "Two cars A and B start from the same point. A moves at constant 20 m/s, B starts from rest with acceleration 4 m/s². When and where does B overtake A?",
                "options": {"A": "t = 10 s, s = 200 m", "B": "t = 5 s, s = 100 m", "C": "t = 10 s, s = 100 m", "D": "t = 20 s, s = 400 m"},
                "correct_option": "A",
                "hint": "Equate distances: 20t = ½(4)t². Solve for t, then find s.",
                "explanation": "20t = 2t² → t = 10 s. s = 20 × 10 = 200 m. B solves 20t = 4t² (missing ½). C gets the time right but uses the wrong s formula. D doubles the time.",
                "misconception": "Forgetting the ½ in s = ½at², which halves the overtaking time.",
            },
            {
                "question": "A particle's v–t graph is linear: velocity rises from 0 to 20 m/s in 4 s, then drops linearly to 0 in the next 6 s. What is the ratio of distances covered in the two intervals?",
                "options": {"A": "2 : 3", "B": "1 : 1", "C": "3 : 2", "D": "4 : 6"},
                "correct_option": "A",
                "hint": "Distance = area under v–t graph. Each phase is a triangle.",
                "explanation": "Phase 1: ½ × 4 × 20 = 40 m. Phase 2: ½ × 6 × 20 = 60 m. Ratio = 40:60 = 2:3. B assumes equal distances. C inverts the ratio. D uses the time ratio directly.",
                "misconception": "Assuming the distance ratio equals the time ratio instead of computing the area under the v–t curve.",
            },
        ],
        "forces": [
            {
                "question": "A 4 kg block on a 30° incline (μₖ = 0.2) is connected by a string over a frictionless pulley to a 6 kg hanging mass. Find the acceleration of the system. (g = 10 m/s²)",
                "options": {"A": "≈ 3.31 m/s²", "B": "6 m/s²", "C": "2 m/s²", "D": "≈ 1.0 m/s²"},
                "correct_option": "A",
                "hint": "Net force = m₂g − m₁g sinθ − μm₁g cosθ. Divide by (m₁ + m₂) for acceleration.",
                "explanation": "Driving: 6×10 = 60 N. Opposing: 4×10×sin30° + 0.2×4×10×cos30° = 20 + 6.93 = 26.93 N. Net = 60 − 26.93 = 33.07 N. a = 33.07/10 ≈ 3.31 m/s². B ignores friction and gravity component on block. C ignores friction. D uses only the gravity difference.",
                "misconception": "Ignoring the friction component on the incline when computing the net force on the system.",
            },
            {
                "question": "A car rounds a flat circular track of radius 50 m. The coefficient of static friction between tyres and road is 0.4. What is the maximum safe speed? (g = 10 m/s²)",
                "options": {"A": "≈ 14.1 m/s", "B": "20 m/s", "C": "10 m/s", "D": "≈ 7.07 m/s"},
                "correct_option": "A",
                "hint": "Friction provides centripetal force: μmg = mv²/r. Mass cancels.",
                "explanation": "v = √(μgr) = √(0.4 × 10 × 50) = √200 ≈ 14.1 m/s. B uses v = μgr (no square root). C uses v = √(gr) ignoring μ. D uses r = 25 m.",
                "misconception": "Forgetting to take the square root of μgr, or omitting the friction coefficient entirely.",
            },
            {
                "question": "Three blocks A (2 kg), B (3 kg), C (5 kg) are in contact on a frictionless surface. A horizontal force of 50 N pushes block A. Find the contact force between B and C.",
                "options": {"A": "25 N", "B": "30 N", "C": "20 N", "D": "50 N"},
                "correct_option": "A",
                "hint": "First find the common acceleration a = F/(m_A + m_B + m_C). Then the force on C = m_C × a.",
                "explanation": "a = 50/10 = 5 m/s². Force between B and C = m_C × a = 5 × 5 = 25 N. B uses (m_B + m_C)×a. C uses m_B × a. D assumes the full force is transmitted.",
                "misconception": "Using the wrong subset of masses — the contact force between B and C only needs to accelerate C.",
            },
        ],
        "energy": [
            {
                "question": "A 2 kg block slides down a 10 m long frictionless incline (30°), then onto a rough horizontal surface (μₖ = 0.5). How far does it travel on the horizontal before stopping? (g = 10 m/s²)",
                "options": {"A": "10 m", "B": "5 m", "C": "20 m", "D": "7.07 m"},
                "correct_option": "A",
                "hint": "Energy on incline: mgh = mg × L sinθ. On the horizontal: this KE is lost to friction μmg × d.",
                "explanation": "Height gained: h = 10 sin30° = 5 m. PE = mgh = 2×10×5 = 100 J. On horizontal: friction force = μmg = 0.5×2×10 = 10 N. Distance d = 100/10 = 10 m. B forgets height = L sinθ. C uses μ = 0.25. D uses h = L cos30°.",
                "misconception": "Using the incline length instead of the vertical height (L sinθ) when computing gravitational PE.",
            },
            {
                "question": "A spring (k = 500 N/m) compressed 0.2 m launches a 0.5 kg ball vertically. How high does the ball rise above the release point? (g = 10 m/s²)",
                "options": {"A": "2 m", "B": "4 m", "C": "1 m", "D": "10 m"},
                "correct_option": "A",
                "hint": "Convert spring PE to gravitational PE: ½kx² = mgh.",
                "explanation": "½ × 500 × 0.04 = 0.5 × 10 × h → 10 = 5h → h = 2 m. B uses kx²/mg (missing the ½). C uses ½kx/mg. D uses kx²/(mg) with wrong x.",
                "misconception": "Forgetting the ½ in ½kx², which doubles the calculated height.",
            },
            {
                "question": "A 4 kg ball moving at 5 m/s has a head-on elastic collision with a 1 kg ball at rest. What is the speed of the 1 kg ball after collision?",
                "options": {"A": "8 m/s", "B": "5 m/s", "C": "4 m/s", "D": "10 m/s"},
                "correct_option": "A",
                "hint": "For elastic collision: v₂ = 2m₁u₁/(m₁ + m₂).",
                "explanation": "v₂ = 2 × 4 × 5 / (4 + 1) = 40/5 = 8 m/s. B assumes the lighter ball gets the same speed. C uses m₁u₁/(m₁+m₂). D uses 2u₁.",
                "misconception": "Using the perfectly inelastic formula instead of the elastic collision formula for the lighter ball.",
            },
        ],
        "waves": [
            {
                "question": "Two organ pipes — one open (length L₁) and one closed (length L₂) — have the same fundamental frequency. What is the ratio L₁/L₂?",
                "options": {"A": "2", "B": "1/2", "C": "1", "D": "4"},
                "correct_option": "A",
                "hint": "Open pipe fundamental: f = v/(2L₁). Closed pipe fundamental: f = v/(4L₂). Set equal.",
                "explanation": "v/(2L₁) = v/(4L₂) → L₁/L₂ = 2. The open pipe must be twice as long to match the fundamental of the closed pipe. B inverts the ratio. C assumes same length. D confuses with overtone.",
                "misconception": "Forgetting that a closed pipe's fundamental wavelength is 4L while an open pipe's is 2L.",
            },
            {
                "question": "A source emitting 500 Hz moves at 34 m/s towards a wall. What is the beat frequency heard by the source from the direct and reflected waves? (v_sound = 340 m/s)",
                "options": {"A": "≈ 111 Hz", "B": "≈ 55.6 Hz", "C": "500 Hz", "D": "≈ 37 Hz"},
                "correct_option": "A",
                "hint": "Wall reflects at the frequency it receives. Source hears its own 500 Hz and the reflected wave Doppler-shifted twice.",
                "explanation": "Wall receives: f' = 500 × 340/(340−34) ≈ 556 Hz. Source (moving toward wall) hears reflected: f'' = 556 × (340+34)/340 ≈ 611 Hz. Beat freq = 611 − 500 ≈ 111 Hz. B uses only one Doppler shift. C ignores Doppler entirely. D uses v_s/v × f.",
                "misconception": "Applying the Doppler shift only once instead of twice (once for the wall as observer, once for the source as observer of the reflection).",
            },
            {
                "question": "A string fixed at both ends has fundamental frequency 200 Hz. If its tension is quadrupled and its length is doubled, what is the new fundamental frequency?",
                "options": {"A": "200 Hz", "B": "400 Hz", "C": "100 Hz", "D": "800 Hz"},
                "correct_option": "A",
                "hint": "f = (1/2L)√(T/μ). Doubling L halves f; quadrupling T doubles v. Combined effect?",
                "explanation": "Original: f₁ = (1/2L)√(T/μ). New: f₂ = (1/4L)√(4T/μ) = (1/4L) × 2√(T/μ) = (2/4L)√(T/μ) = (1/2L)√(T/μ) = f₁ = 200 Hz. The two changes exactly cancel. B only accounts for tension change. C only accounts for length change. D multiplies both effects.",
                "misconception": "Thinking tension and length effects multiply instead of recognizing they can cancel each other.",
            },
        ],
        "light": [
            {
                "question": "A thin convex lens forms a real, inverted image 3 times the size of the object. If the object-to-image distance is 40 cm, what is the focal length?",
                "options": {"A": "7.5 cm", "B": "10 cm", "C": "15 cm", "D": "30 cm"},
                "correct_option": "A",
                "hint": "For a real image, m = −v/u = −3. So v = 3|u|. Also |u| + |v| = 40 cm.",
                "explanation": "Let |u| = x. Then v = 3x and x + 3x = 40 → x = 10 cm. u = −10, v = +30. 1/f = 1/30 − 1/(−10) = 1/30 + 1/10 = 4/30 → f = 7.5 cm. B uses f = u. C uses f = v/2. D uses f = v.",
                "misconception": "Using the magnification formula without proper sign convention, or confusing object distance with focal length.",
            },
            {
                "question": "In YDSE with λ = 600 nm, d = 1 mm, D = 1.5 m, the entire setup is immersed in water (n = 4/3). What is the new fringe width?",
                "options": {"A": "0.675 mm", "B": "0.9 mm", "C": "1.2 mm", "D": "0.45 mm"},
                "correct_option": "A",
                "hint": "In a medium, effective wavelength λ' = λ/n. Fringe width β = λ'D/d.",
                "explanation": "λ' = 600/1.333 = 450 nm. β = 450×10⁻⁹ × 1.5 / 10⁻³ = 675×10⁻⁶ m = 0.675 mm. B uses λ without correction. C doubles the fringe width. D uses n² in the denominator.",
                "misconception": "Using the vacuum wavelength instead of the wavelength in the medium (λ/n) for fringe width calculations.",
            },
            {
                "question": "A 60° glass prism (μ = √2) is in the position of minimum deviation. What is the angle of incidence?",
                "options": {"A": "45°", "B": "30°", "C": "60°", "D": "90°"},
                "correct_option": "A",
                "hint": "At minimum deviation: μ = sin((A + D_m)/2) / sin(A/2). First find D_m, then i = (A + D_m)/2.",
                "explanation": "sin(A/2) = sin30° = 0.5. μ sin(A/2) = √2 × 0.5 = 0.707 = sin45°. So (A + D_m)/2 = 45° → D_m = 30°. At min deviation, i = (A + D_m)/2 = 45°. B uses i = A/2. C uses i = A. D is the grazing incidence condition.",
                "misconception": "Confusing the minimum deviation angle with the prism angle, or using i = A at minimum deviation.",
            },
        ],
        "electricity": [
            {
                "question": "Five identical resistors of 10 Ω each form a Wheatstone bridge with one in the galvanometer arm. What is the equivalent resistance between the input terminals?",
                "options": {"A": "10 Ω", "B": "5 Ω", "C": "2.5 Ω", "D": "20 Ω"},
                "correct_option": "A",
                "hint": "If all four arms are equal, the bridge is balanced — no current through the 5th resistor. Simplify the balanced bridge.",
                "explanation": "Balanced bridge: galvanometer arm carries zero current. Two series pairs (10+10 = 20 Ω each) in parallel: 20×20/(20+20) = 10 Ω. B treats all in parallel. C uses all five in parallel. D puts all in series.",
                "misconception": "Not recognizing that in a balanced Wheatstone bridge, the galvanometer arm can be ignored for equivalent resistance.",
            },
            {
                "question": "A 10 μF capacitor charged to 100 V is connected across an uncharged 40 μF capacitor. What is the common voltage and the energy lost?",
                "options": {"A": "20 V, 0.04 J", "B": "25 V, 0.025 J", "C": "50 V, 0.025 J", "D": "20 V, 0.08 J"},
                "correct_option": "A",
                "hint": "Charge is conserved: Q = C₁V₁ = (C₁ + C₂)V_f. Energy lost = ½C₁V₁² − ½(C₁+C₂)V_f².",
                "explanation": "Q = 10×10⁻⁶ × 100 = 10⁻³ C. V_f = Q/(C₁+C₂) = 10⁻³/(50×10⁻⁶) = 20 V. Initial E = ½×10⁻⁵×10000 = 0.05 J. Final E = ½×50×10⁻⁶×400 = 0.01 J. Lost = 0.04 J. B uses simple voltage average. C halves voltage. D doubles the loss.",
                "misconception": "Averaging voltages instead of conserving charge, or assuming energy is conserved in capacitor redistribution.",
            },
            {
                "question": "In a circuit, a 6 V battery (internal resistance 1 Ω) is connected to two resistors: 2 Ω and 3 Ω in parallel. What is the current drawn from the battery?",
                "options": {"A": "≈ 2.73 A", "B": "3 A", "C": "6 A", "D": "1.2 A"},
                "correct_option": "A",
                "hint": "Find parallel combination of 2 and 3 Ω first, then add internal resistance. I = EMF/(R_eq + r).",
                "explanation": "R_parallel = 2×3/(2+3) = 1.2 Ω. Total R = 1.2 + 1 = 2.2 Ω. I = 6/2.2 ≈ 2.73 A. B ignores internal resistance. C uses I = V/r. D uses the series combination instead of parallel.",
                "misconception": "Ignoring the battery's internal resistance when computing total circuit current.",
            },
        ],
        "magnetism": [
            {
                "question": "A rectangular coil (20 turns, area 0.05 m²) rotates at 50 rev/s in a 0.1 T field. What is the peak EMF?",
                "options": {"A": "≈ 31.4 V", "B": "≈ 5 V", "C": "≈ 15.7 V", "D": "≈ 62.8 V"},
                "correct_option": "A",
                "hint": "Peak EMF = NBAω, where ω = 2πf.",
                "explanation": "ω = 2π × 50 = 100π. EMF₀ = 20 × 0.1 × 0.05 × 100π = 10π ≈ 31.4 V. B uses ω = f (not 2πf). C uses N = 10. D uses ω = 4πf.",
                "misconception": "Using f directly instead of ω = 2πf in the EMF formula.",
            },
            {
                "question": "A conducting rod of length 1 m moves at 5 m/s perpendicular to B = 0.4 T. The rod is part of a closed circuit (R = 2 Ω). What force is needed to maintain constant velocity?",
                "options": {"A": "0.4 N", "B": "2 N", "C": "0.2 N", "D": "1 N"},
                "correct_option": "A",
                "hint": "EMF = BLv → I = EMF/R → F = BIL. The applied force must equal the magnetic braking force.",
                "explanation": "EMF = 0.4 × 1 × 5 = 2 V. I = 2/2 = 1 A. F = BIL = 0.4 × 1 × 1 = 0.4 N. B uses F = BLv (missing the current step). C divides by 2. D uses F = EMF/R.",
                "misconception": "Confusing EMF with force, or not computing the induced current before finding the magnetic force.",
            },
            {
                "question": "Two parallel wires 5 cm apart carry 10 A and 20 A in opposite directions. What is the force per metre between them, and is it attractive or repulsive? (μ₀ = 4π × 10⁻⁷)",
                "options": {"A": "8 × 10⁻⁴ N/m, repulsive", "B": "8 × 10⁻⁴ N/m, attractive", "C": "4 × 10⁻⁴ N/m, repulsive", "D": "4 × 10⁻³ N/m, attractive"},
                "correct_option": "A",
                "hint": "F/L = μ₀I₁I₂/(2πd). Opposite currents → repulsive.",
                "explanation": "F/L = 4π×10⁻⁷ × 10 × 20 / (2π × 0.05) = 8×10⁻⁴ N/m. Opposite currents repel. B gets magnitude right but wrong direction. C uses d = 0.1. D uses d = 0.005.",
                "misconception": "Confusing whether same-direction currents attract or repel (they attract; opposite-direction currents repel).",
            },
        ],
        "heat": [
            {
                "question": "100 g of ice at 0°C is added to 300 g of water at 80°C in an insulated container. What is the final temperature? (L_f = 336 kJ/kg, c_water = 4200 J/(kg·°C))",
                "options": {"A": "40°C", "B": "60°C", "C": "0°C", "D": "20°C"},
                "correct_option": "A",
                "hint": "Check if the heat from the water is enough to melt all the ice, then find the equilibrium temperature.",
                "explanation": "Heat to melt ice: 0.1 × 336000 = 33600 J. Heat from water cooling to 0°C: 0.3 × 4200 × 80 = 100800 J. All ice melts (100800 > 33600). Remaining heat: 100800 − 33600 = 67200 J warms 0.4 kg water. ΔT = 67200/(0.4 × 4200) = 40°C. Final T = 40°C. B just averages 0 and 80. C assumes ice doesn't melt. D uses wrong mass.",
                "misconception": "Simply averaging the temperatures without accounting for the latent heat needed to melt the ice.",
            },
            {
                "question": "An ideal diatomic gas (γ = 7/5) at 300 K is compressed adiabatically to 1/8 of its volume. What is the final temperature?",
                "options": {"A": "≈ 689 K", "B": "2400 K", "C": "300 K", "D": "≈ 1200 K"},
                "correct_option": "A",
                "hint": "For adiabatic process: TV^(γ−1) = constant. T₂ = T₁(V₁/V₂)^(γ−1).",
                "explanation": "T₂ = 300 × 8^(0.4) = 300 × 8^(2/5). 8^(1/5) = 2^(3/5) ≈ 1.516. 8^(2/5) ≈ 2.297. T₂ ≈ 300 × 2.297 ≈ 689 K. B uses T₂ = T₁ × V₁/V₂ (isothermal pressure relation). C assumes no temperature change. D uses γ instead of (γ−1).",
                "misconception": "Using PV = nRT (isothermal relation) for an adiabatic process instead of TV^(γ−1) = constant.",
            },
            {
                "question": "A Carnot engine with efficiency 40% exhausts heat to a sink at 300 K. If the engine absorbs 2000 J per cycle, what is the source temperature and work done per cycle?",
                "options": {"A": "500 K, 800 J", "B": "750 K, 800 J", "C": "500 K, 1200 J", "D": "420 K, 800 J"},
                "correct_option": "A",
                "hint": "η = 1 − T_cold/T_hot and W = ηQ_hot.",
                "explanation": "0.4 = 1 − 300/T_hot → T_hot = 300/0.6 = 500 K. W = 0.4 × 2000 = 800 J. B uses T_hot = T_cold/η. C gives W = Q − ηQ (wrong). D uses η = T_cold/T_hot.",
                "misconception": "Rearranging the Carnot efficiency formula incorrectly: T_hot = T_cold/(1−η), not T_cold/η.",
            },
        ],
        "gravity": [
            {
                "question": "A satellite orbits at height equal to Earth's radius R above the surface. What is its orbital speed as a fraction of the surface orbital speed v₀ = √(gR)?",
                "options": {"A": "v₀/√2", "B": "v₀/2", "C": "v₀", "D": "v₀/4"},
                "correct_option": "A",
                "hint": "Orbital speed v = √(GM/r). At surface: v₀ = √(GM/R). At height R: r = 2R.",
                "explanation": "v = √(GM/(2R)) = √(GM/R) × 1/√2 = v₀/√2. B uses v = v₀ × R/(2R). C ignores the altitude. D squares the ratio instead of taking the root.",
                "misconception": "Using an inverse-linear relationship v ∝ 1/r instead of the correct v ∝ 1/√r.",
            },
            {
                "question": "A planet has twice Earth's radius and the same density. What is its escape velocity relative to Earth's (v_e = 11.2 km/s)?",
                "options": {"A": "22.4 km/s", "B": "15.8 km/s", "C": "11.2 km/s", "D": "44.8 km/s"},
                "correct_option": "A",
                "hint": "Escape velocity v = √(2GM/R). Express M in terms of density and R, then see how v scales with R.",
                "explanation": "M = (4/3)πR³ρ. So v = √(2G × (4/3)πR³ρ / R) = √((8/3)πGρ) × R. Same density, double R → v doubles. v = 2 × 11.2 = 22.4 km/s. B uses v ∝ √R. C assumes no change. D uses v ∝ R².",
                "misconception": "Assuming v_escape ∝ √R (which is true for constant M, not constant density).",
            },
            {
                "question": "A body is projected from Earth's surface with speed v = v_escape/2. What maximum height (above the surface) does it reach? (R = Earth's radius)",
                "options": {"A": "R/3", "B": "R/2", "C": "R", "D": "R/4"},
                "correct_option": "A",
                "hint": "Use energy conservation: ½mv² − GMm/R = −GMm/(R+h). Note v_escape = √(2GM/R).",
                "explanation": "½m(v_e/2)² − GMm/R = −GMm/(R+h). v_e² = 2GM/R, so ½m(GM/(2R)) = GMm/(R+h) − GMm/R. Simplify: GM/(4R) = GM×(1/R − 1/(R+h)). 1/(4R) = h/(R(R+h)). R+h = 4Rh/R... → (R+h) = 4h → R = 3h → h = R/3. B uses energy incorrectly. C uses v = v_e/√2 result. D uses h = R/v_e²×v².",
                "misconception": "Using h = v²/(2g) (constant-g approximation) instead of the gravitational PE expression that accounts for varying g.",
            },
        ],
        "quantum": [
            {
                "question": "Light of wavelength 200 nm falls on a metal (work function 4.2 eV). If the stopping potential is V₀, what happens when the wavelength is halved? (hc = 1240 eV·nm)",
                "options": {"A": "V₀ increases by 6.2 V", "B": "V₀ doubles", "C": "V₀ increases by 4.0 V", "D": "V₀ stays the same"},
                "correct_option": "A",
                "hint": "eV₀ = hc/λ − φ. Find V₀ for both wavelengths and compute the change.",
                "explanation": "At 200 nm: eV₀ = 1240/200 − 4.2 = 6.2 − 4.2 = 2.0 eV, so V₀ = 2.0 V. At 100 nm: eV₀' = 1240/100 − 4.2 = 12.4 − 4.2 = 8.2 eV, V₀' = 8.2 V. Change = 8.2 − 2.0 = 6.2 V. B assumes linear scaling. C subtracts φ again. D ignores wavelength change.",
                "misconception": "Assuming stopping potential scales linearly with frequency — it does, but the work function offset means halving λ doesn't simply double V₀.",
            },
            {
                "question": "In hydrogen, how many spectral lines are emitted when electrons de-excite from n = 4 to the ground state?",
                "options": {"A": "6", "B": "4", "C": "3", "D": "10"},
                "correct_option": "A",
                "hint": "Total lines from level n = n(n−1)/2. Think of all possible transitions.",
                "explanation": "Possible transitions: 4→3, 4→2, 4→1, 3→2, 3→1, 2→1 = 6 lines. Formula: 4(4−1)/2 = 6. B counts only downward steps. C counts only transitions to ground state. D uses n² − n.",
                "misconception": "Only counting transitions to the ground state (4→1, 3→1, 2→1 = 3) instead of all possible transitions between levels.",
            },
            {
                "question": "The binding energy per nucleon of ⁵⁶Fe is 8.8 MeV and of ²³⁵U is 7.6 MeV. Estimate the energy released per fission of ²³⁵U into two equal fragments.",
                "options": {"A": "≈ 282 MeV", "B": "≈ 200 MeV", "C": "≈ 1.2 MeV", "D": "≈ 470 MeV"},
                "correct_option": "A",
                "hint": "Energy released = total BE of products − total BE of reactant. Each fragment has ~118 nucleons.",
                "explanation": "Products: 2 fragments of ~117.5 nucleons. BE/nucleon of products ≈ 8.8 MeV (near Fe). Total BE products = 235 × 8.8 = 2068 MeV. Total BE reactant = 235 × 7.6 = 1786 MeV. Released = 2068 − 1786 = 282 MeV. B is a rough estimate. C uses BE difference per nucleon only. D doubles the answer.",
                "misconception": "Calculating energy per nucleon difference (1.2 MeV) and forgetting to multiply by the total number of nucleons (235).",
            },
        ],
    }
    raw = _by_skill.get(skill, _by_skill["motion"])
    return [_shuffle_mcq_options(q) for q in raw]


def _shuffle_mcq_options(q: dict) -> dict:
    """Randomly rearrange A/B/C/D so the correct answer isn't always the same letter."""
    opts = q.get("options", {})
    correct_key = q.get("correct_option", "A")
    correct_text = opts.get(correct_key, "")

    letters = ["A", "B", "C", "D"]
    texts = [opts[k] for k in letters]
    random.shuffle(texts)

    new_opts = dict(zip(letters, texts))
    new_correct = next(k for k, v in new_opts.items() if v == correct_text)

    return {**q, "options": new_opts, "correct_option": new_correct}


# ── Answer evaluation ─────────────────────────────────────────────────────────

def evaluate_answers(
    skill: str,
    case_id: str,
    qa_pairs: list[dict],
) -> dict:
    """
    Grade a batch of MCQ answers deterministically.
    Each qa_pair should have 'correct_option' (the right letter) and 'student_answer' (selected letter).
    """
    results = []
    gaps = []
    for p in qa_pairs:
        selected = (p.get("student_answer") or "").strip().upper()
        correct  = (p.get("correct_option") or p.get("answer", "")).strip().upper()
        misconception = p.get("misconception", "")
        is_correct = (selected == correct)

        if is_correct:
            results.append({"correct": True, "gap": "", "feedback": "Correct!"})
        else:
            gap = misconception or f"Selected {selected} instead of {correct}"
            results.append({
                "correct": False,
                "gap": gap,
                "feedback": f"The correct answer is {correct}. {p.get('explanation', misconception)}",
            })
            if gap:
                gaps.append(gap)

    n = len(results)
    correct_count = sum(1 for r in results if r["correct"])
    overall_score = round(correct_count / n * 100) if n else 0
    delta = round((correct_count / n - 0.5) * 20) if n else 0

    return {
        "results": results,
        "overall_score": overall_score,
        "delta": delta,
        "gaps": gaps[:3],
        "summary_feedback": (
            f"You got {correct_count}/{n} correct."
            + (" Great work!" if overall_score >= 80 else " Review the explanations for the ones you missed.")
        ),
        "needs_remediation": overall_score < 60,
        "remediation_concept": gaps[0] if gaps else case_id.replace("_", " "),
    }


# ── Adaptive single-question flow ─────────────────────────────────────────────

def _difficulty_tier(mastery_score: int) -> str:
    """Shared difficulty description used by both batch and adaptive generation."""
    if mastery_score < 30:
        return (
            "FOUNDATION: Single-concept MCQs. Each question should test ONE formula or principle "
            "with specific numerical values. The wrong options should reflect common calculation errors "
            "(wrong formula, sign mistakes, missing conversions)."
        )
    elif mastery_score < 65:
        return (
            "INTERMEDIATE: Multi-step MCQs combining 2 formulas or requiring careful reasoning. "
            "Distractors should be plausible intermediate results or results from common misconceptions "
            "(e.g., forgetting a component, using the wrong sign convention)."
        )
    else:
        return (
            "ADVANCED: Conceptual-trap MCQs that require deep understanding. Distractors should "
            "include answers obtained from common intuitive-but-wrong reasoning, overlooking limiting "
            "cases, or confusing similar formulas."
        )


def generate_single_question(
    skill: str,
    case_id: str,
    mastery_score: int,
    previous_questions: list[str] | None = None,
) -> dict:
    """Generate exactly ONE question, avoiding repeats of previous sub-concepts."""
    skill_label = SKILLS.get(skill, {}).get("label", skill)
    case_obj = next(
        (c for c in SKILLS.get(skill, {}).get("cases", []) if c["id"] == case_id), {}
    )
    case_label = case_obj.get("label", case_id)
    case_desc  = case_obj.get("desc", "")
    difficulty = _difficulty_tier(mastery_score)

    prev_block = ""
    if previous_questions:
        numbered = "\n".join(f"  {i+1}. {q}" for i, q in enumerate(previous_questions))
        prev_block = f"\nQuestions already asked this session (do NOT repeat these sub-concepts):\n{numbered}\n"

    prompt = f"""You are a competitive physics exam question writer at JEE level.

Generate EXACTLY 1 multiple-choice question (MCQ) for:
  Topic: {skill_label}
  Sub-topic: {case_label} — {case_desc}
  Difficulty: {difficulty}
  Student mastery: {mastery_score}%
{prev_block}
RULES:
1. The question MUST test a DIFFERENT sub-concept from any listed above.
2. Include specific numerical values (masses, speeds, angles, distances, etc.).
3. Provide EXACTLY 4 options labelled A, B, C, D. Exactly ONE must be correct.
4. DISTRACTORS: Each wrong option must come from a specific, realistic mistake — NOT random numbers. Examples: using the wrong formula, forgetting a component, sign error, missing a factor of 2.
5. The "correct_option" field must be the letter (A/B/C/D) of the correct answer.
6. The "explanation" field must show the worked solution AND briefly explain why each wrong option is wrong.
7. Shuffle the correct answer position — do NOT always put it as option A.
8. Return ONLY valid JSON — no markdown, no extra text.

Return this exact JSON object:
{{
  "question": "<full question text with numerical values and units>",
  "options": {{
    "A": "<option A text>",
    "B": "<option B text>",
    "C": "<option C text>",
    "D": "<option D text>"
  }},
  "correct_option": "<A, B, C, or D>",
  "hint": "<one-sentence conceptual hint, NOT the answer>",
  "explanation": "<worked solution + why each distractor is wrong>",
  "misconception": "<the specific wrong approach that leads to one of the distractors>"
}}"""

    try:
        resp = _client.messages.create(
            model=_CHAT_MODEL,
            max_tokens=500,
            temperature=0.65,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = resp.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        q = json.loads(raw)
        if isinstance(q, list):
            q = q[0]
        if isinstance(q, dict) and "question" in q:
            return q
    except Exception as e:
        logger.error("Single question generation failed: %s", e)

    fallbacks = _fallback_questions(skill, case_id)
    idx = len(previous_questions or []) % len(fallbacks)
    return fallbacks[idx]


def evaluate_single_answer(
    skill: str,
    case_id: str,
    question: str,
    correct_answer: str,
    misconception: str,
    student_answer: str,
) -> dict:
    """Grade a single MCQ answer. Compares selected option to correct_option deterministically."""
    if not student_answer:
        return {"correct": False, "gap": "No answer selected", "feedback": "You didn't select an option."}

    selected = student_answer.strip().upper()
    correct  = correct_answer.strip().upper()
    is_correct = (selected == correct)

    if is_correct:
        return {
            "correct": True,
            "gap": "",
            "feedback": "Correct! Well done.",
        }
    else:
        gap = misconception if misconception else f"Selected {selected} instead of {correct}"
        return {
            "correct": False,
            "gap": gap,
            "feedback": f"The correct answer is {correct}. {misconception}" if misconception else f"The correct answer is {correct}.",
        }


def store_single_answer(
    session_id: str,
    student_id: str,
    skill: str,
    question_text: str,
    student_answer: str,
    correct: bool,
    gap: str,
    feedback: str,
) -> int:
    """Store one answer, update session timestamp, update mastery. Returns new mastery score."""
    with _db() as conn:
        conn.execute(
            """INSERT INTO answers (id, session_id, question_text, student_answer, correct, gap_label, feedback)
               VALUES (?,?,?,?,?,?,?)""",
            (str(uuid.uuid4()), session_id, question_text, student_answer,
             1 if correct else 0, gap, feedback),
        )
        conn.execute(
            "UPDATE sessions SET completed_at=?, score=COALESCE(score,0) WHERE id=?",
            (time.time(), session_id),
        )

    gaps = [gap] if gap else []
    _update_mastery(student_id, skill, 0, 0, gaps)

    mastery_map = get_mastery(student_id)
    return mastery_map.get(skill, {}).get("score", 0)


_MAX_QUESTIONS_PER_SESSION = 9
_MASTERY_THRESHOLD = 80
_CONSECUTIVE_CORRECT_EXIT = 3


def should_continue_session(
    student_id: str,
    skill: str,
    questions_answered: int,
    recent_results: list[bool],
) -> bool:
    """Decide whether the adaptive session should continue."""
    if questions_answered >= _MAX_QUESTIONS_PER_SESSION:
        return False

    mastery_map = get_mastery(student_id)
    current_mastery = mastery_map.get(skill, {}).get("score", 0)
    if current_mastery >= _MASTERY_THRESHOLD:
        return False

    if len(recent_results) >= _CONSECUTIVE_CORRECT_EXIT:
        last_n = recent_results[-_CONSECUTIVE_CORRECT_EXIT:]
        if all(last_n):
            return False

    return True


def build_session_summary(
    session_id: str,
    student_id: str,
    skill: str,
    mastery_before: int,
    results_history: list[dict],
) -> dict:
    """Build the final summary when an adaptive session ends."""
    mastery_map = get_mastery(student_id)
    mastery_after = mastery_map.get(skill, {}).get("score", 0)

    total = len(results_history)
    correct_count = sum(1 for r in results_history if r.get("correct"))
    overall_score = round(correct_count / total * 100) if total else 0

    gaps = list(dict.fromkeys(
        r.get("gap", "") for r in results_history if r.get("gap")
    ))[:10]

    needs_remediation = overall_score < 60
    remediation_concept = gaps[0] if gaps else ""

    delta = mastery_after - mastery_before

    case_id = ""
    with _db() as conn:
        row = conn.execute("SELECT case_id FROM sessions WHERE id=?", (session_id,)).fetchone()
        if row:
            case_id = row["case_id"]

    if total >= 3:
        summary_feedback = (
            f"You answered {correct_count}/{total} questions correctly. "
            f"Your mastery moved from {mastery_before}% to {mastery_after}%. "
        )
        if correct_count == total:
            summary_feedback += "Excellent work — you nailed every question!"
        elif correct_count >= total * 0.7:
            summary_feedback += "Solid performance. Review the gaps below to push higher."
        else:
            summary_feedback += "Focus on the formulas flagged in your feedback to improve."
    else:
        summary_feedback = f"Session complete. Mastery: {mastery_before}% → {mastery_after}%."

    return {
        "total": total,
        "correct_count": correct_count,
        "overall_score": overall_score,
        "delta": delta,
        "mastery_before": mastery_before,
        "mastery_after": mastery_after,
        "results": results_history,
        "gaps": gaps,
        "summary_feedback": summary_feedback,
        "needs_remediation": needs_remediation,
        "remediation_concept": remediation_concept,
        "case_id": case_id,
    }


# ── Recommendation engine ─────────────────────────────────────────────────────

def get_recommendations(student_id: str) -> dict:
    """
    Build Netflix-style recommendation rows for a student.

    Returns:
    {
      "next_for_you":    [{"skill", "case_id", "label", "desc", "match_pct"}, ...],
      "review":          [...],
      "ready_to_master": [...],
      "mastery":         {skill: {score, attempts, gaps}},
      "overall_mastery": int,
    }
    """
    mastery = get_mastery(student_id)

    # Score each (skill, case) pair
    scored: list[dict] = []
    for skill_id, skill_data in SKILLS.items():
        skill_mastery = mastery.get(skill_id, {})
        score = skill_mastery.get("score", 0)
        attempts = skill_mastery.get("attempts", 0)
        gaps = skill_mastery.get("gaps", [])
        last_updated = skill_mastery.get("last_updated", 0)

        for case in skill_data["cases"]:
            rec_score = _recommendation_score(score, attempts, gaps, last_updated)
            scored.append({
                "skill": skill_id,
                "skill_label": skill_data["label"],
                "skill_icon": skill_data.get("icon", "📚"),
                "case_id": case["id"],
                "label": case["label"],
                "desc": case["desc"],
                "mastery": score,
                "attempts": attempts,
                "match_pct": rec_score,
            })

    scored.sort(key=lambda x: x["match_pct"], reverse=True)

    # Partition into rows
    not_started  = [c for c in scored if c["attempts"] == 0]
    in_progress  = [c for c in scored if 0 < c["attempts"] and c["mastery"] < 80]
    near_mastery = [c for c in scored if c["mastery"] >= 80 and c["mastery"] < 100]
    # Struggling: in_progress where mastery is low
    struggling   = [c for c in in_progress if c["mastery"] < 50]

    def _dedup_by_skill(items, limit):
        seen = set()
        out = []
        for item in items:
            if item["skill"] not in seen:
                seen.add(item["skill"])
                out.append(item)
            if len(out) >= limit:
                break
        return out

    raw_next = struggling + in_progress + not_started
    deduped_next = _dedup_by_skill(raw_next, 6)

    attempted_scores = [m.get("score", 0) for m in mastery.values() if m.get("attempts", 0) > 0]
    overall = round(sum(attempted_scores) / max(len(attempted_scores), 1)) if attempted_scores else 0

    return {
        "next_for_you":    deduped_next,
        "review":          _dedup_by_skill(in_progress, 6),
        "ready_to_master": _dedup_by_skill(near_mastery, 4),
        "mastery":         mastery,
        "overall_mastery": overall,
        "skills":          {sid: {"label": sd["label"], "icon": sd.get("icon", "📚")} for sid, sd in SKILLS.items()},
    }


def _recommendation_score(
    mastery: int, attempts: int, gaps: list, last_updated: float
) -> int:
    """
    Score how strongly to recommend a (skill, case) to a student.
    Higher = recommend more strongly.  Used for sorting, NOT displayed as a percentage.
    """
    if attempts == 0:
        return 0

    score = 50

    if mastery < 50:
        score += 30
    elif mastery < 80:
        score += 15
    elif mastery >= 80:
        score -= 10

    age_days = (time.time() - last_updated) / 86400 if last_updated else 9999
    if age_days < 1:
        score -= 20
    elif age_days > 7:
        score += 10

    score += min(len(gaps) * 5, 20)

    return max(0, min(100, score))


# ── Session management ────────────────────────────────────────────────────────

def start_session(student_id: str, skill: str, case_id: str) -> str:
    session_id = str(uuid.uuid4())
    with _db() as conn:
        conn.execute(
            "INSERT INTO sessions (id, student_id, skill, case_id, started_at) VALUES (?,?,?,?,?)",
            (session_id, student_id, skill, case_id, time.time()),
        )
    return session_id


def complete_session(
    session_id: str,
    student_id: str,
    skill: str,
    overall_score: int,
    delta: int,
    gaps: list[str],
    answer_rows: list[dict],
) -> None:
    with _db() as conn:
        conn.execute(
            "UPDATE sessions SET completed_at=?, score=? WHERE id=?",
            (time.time(), overall_score, session_id),
        )
        for row in answer_rows:
            conn.execute(
                """INSERT INTO answers
                   (id, session_id, question_text, student_answer, correct, gap_label, feedback)
                   VALUES (?,?,?,?,?,?,?)""",
                (
                    str(uuid.uuid4()),
                    session_id,
                    row.get("question", ""),
                    row.get("student_answer", ""),
                    1 if row.get("correct") else 0,
                    row.get("gap", ""),
                    row.get("feedback", ""),
                ),
            )
    _update_mastery(student_id, skill, overall_score, delta, gaps)


# ── Remediation animation query ───────────────────────────────────────────────

def get_remediation_prompt(case_id: str, remediation_concept: str) -> str:
    """
    Return a PhysiMate animation prompt for the gap concept.
    Falls back to a generic prompt if case_id not in catalogue.
    """
    base = _REMEDIATION_PROMPTS.get(
        case_id,
        f"Explain {case_id.replace('_', ' ')} with a clear physics animation.",
    )
    if remediation_concept and remediation_concept.lower() not in base.lower():
        return f"{base} Focus specifically on: {remediation_concept}."
    return base


# ─────────────────────────────────────────────────────────────────────────────
# ── Forum persistence ────────────────────────────────────────────────────────
# ─────────────────────────────────────────────────────────────────────────────

def forum_get_posts(case_id: str | None = None) -> list[dict]:
    """Return forum posts (with nested replies), optionally filtered by case_id."""
    with _db() as conn:
        if case_id:
            rows = conn.execute(
                "SELECT * FROM forum_posts WHERE case_id = ? ORDER BY created_at DESC", (case_id,)
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM forum_posts ORDER BY created_at DESC").fetchall()
        posts = []
        for r in rows:
            replies = conn.execute(
                "SELECT * FROM forum_replies WHERE post_id = ? ORDER BY created_at ASC", (r["id"],)
            ).fetchall()
            posts.append({
                "id": r["id"], "title": r["title"], "body": r["body"],
                "author": r["author"], "tags": json.loads(r["tags"] or "[]"),
                "videoUrl": r["video_url"], "upvotes": r["upvotes"],
                "case_id": r["case_id"], "createdAt": r["created_at"],
                "replies": [
                    {"id": rp["id"], "author": rp["author"], "body": rp["body"],
                     "upvotes": rp["upvotes"], "createdAt": rp["created_at"]}
                    for rp in replies
                ],
            })
    return posts


def forum_upsert_post(post: dict) -> None:
    """Insert or ignore a forum post (idempotent by id)."""
    with _db() as conn:
        conn.execute(
            """INSERT OR IGNORE INTO forum_posts
               (id, title, body, author, tags, video_url, upvotes, case_id, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                post["id"], post["title"], post["body"], post.get("author", "Student"),
                json.dumps(post.get("tags", [])), post.get("videoUrl"),
                post.get("upvotes", 0), post.get("case_id"),
                post.get("createdAt", ""),
            ),
        )


def forum_add_reply(post_id: str, reply: dict) -> bool:
    """Add a reply to a post. Returns True if the post exists."""
    with _db() as conn:
        post = conn.execute("SELECT id FROM forum_posts WHERE id = ?", (post_id,)).fetchone()
        if not post:
            return False
        conn.execute(
            """INSERT OR IGNORE INTO forum_replies
               (id, post_id, author, body, upvotes, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (reply["id"], post_id, reply.get("author", "Student"),
             reply["body"], reply.get("upvotes", 0), reply.get("createdAt", "")),
        )
    return True


def forum_upvote_post(post_id: str) -> int | None:
    """Increment upvote count. Returns new count or None if not found."""
    with _db() as conn:
        row = conn.execute("SELECT upvotes FROM forum_posts WHERE id = ?", (post_id,)).fetchone()
        if not row:
            return None
        new_count = row["upvotes"] + 1
        conn.execute("UPDATE forum_posts SET upvotes = ? WHERE id = ?", (new_count, post_id))
    return new_count


# ─────────────────────────────────────────────────────────────────────────────
# ── Waitlist persistence ─────────────────────────────────────────────────────
# ─────────────────────────────────────────────────────────────────────────────

def waitlist_add(email: str) -> int:
    """Add email to waitlist (idempotent). Returns total count."""
    email = email.strip().lower()
    with _db() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO waitlist (email, joined_at) VALUES (?, ?)",
            (email, time.time()),
        )
        count = conn.execute("SELECT COUNT(*) as c FROM waitlist").fetchone()["c"]
    return count


def waitlist_count() -> int:
    with _db() as conn:
        return conn.execute("SELECT COUNT(*) as c FROM waitlist").fetchone()["c"]
