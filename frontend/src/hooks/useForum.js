import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../utils/api'

const STORAGE_KEY = 'bw-forum-posts'
const UPVOTE_KEY  = 'bw-forum-upvotes'
const SYNC_EVENT  = 'bw-forum-changed'

// ─── Storage helpers ──────────────────────────────────────────────────────────

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function loadPosts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function loadUpvoted() {
  try {
    const raw = localStorage.getItem(UPVOTE_KEY)
    return new Set(raw ? JSON.parse(raw) : [])
  } catch { return new Set() }
}

// Write both stores at once and fire ONE sync event
function persistAll(posts, upvotedSet) {
  if (posts !== undefined)      localStorage.setItem(STORAGE_KEY, JSON.stringify(posts))
  if (upvotedSet !== undefined) localStorage.setItem(UPVOTE_KEY, JSON.stringify([...upvotedSet]))
  window.dispatchEvent(new Event(SYNC_EVENT))
}

// ─── Seed data ────────────────────────────────────────────────────────────────

const SEED_IDS = [
  'seed-video-1','seed-video-2','seed-video-3','seed-video-4','seed-video-5','seed-video-6',
  'seed-t1','seed-t2','seed-t3','seed-t4','seed-t5','seed-t6','seed-t7','seed-t8',
]

// Dates computed once at module load (not on every render)
const NOW = Date.now()
const ago = (ms) => new Date(NOW - ms).toISOString()
const m   = 60 * 1000
const h   = 60 * m
const d   = 24 * h

const SEED_POSTS = [
  {
    id: 'seed-video-1',
    title: "Watch: Double Pendulum — Why does it go chaotic?",
    body: `This Manim animation shows a double pendulum in motion. Even though both rods follow the same Newtonian mechanics, the system becomes completely unpredictable after just a few seconds.

Why does this happen? A single pendulum is periodic — it swings on a regular cycle. But in a double pendulum, tiny differences in starting angle amplify exponentially. This is deterministic chaos: the equations are exact, but the motion is practically impossible to predict.

Key physics concepts shown:
• Conservation of energy — total mechanical energy stays constant, transferring between rotational KE, linear KE, and PE
• Newton's second law for rotational motion: torque = Iα
• Coupled differential equations — two pendulums linked by a shared pivot
• Sensitive dependence on initial conditions (the butterfly effect)

Watch the video: at what point does the motion "break" from looking predictable?`,
    author: "Physics Lab",
    createdAt: ago(2 * h),
    tags: ["#chaos-theory", "#pendulum", "#rotational-motion", "#Newton's-laws", "#mechanics"],
    videoUrl: "/videos/clips/DoublePendulum.mp4",
    upvotes: 47,
    replies: [
      { id: 'svr-1', author: "Kai M.",      upvotes: 18, body: "The moment the inner rod crosses vertical is when things go wild — torque flips sign and the equations get coupled non-linearly. Spent an hour staring at this in A-level.", createdAt: ago(90 * m) },
      { id: 'svr-2', author: "Priya N.",    upvotes: 12, body: "This helped me understand why weather forecasting is hard. Same idea — deterministic laws but exponentially amplifying errors. The Lorenz attractor is the classic atmospheric physics example.", createdAt: ago(30 * m) },
      { id: 'svr-3', author: "Sam O.",      upvotes: 9,  body: "Question — does the period before chaos depend on the starting angle? Like a bigger initial angle = faster divergence?", createdAt: ago(15 * m) },
      { id: 'svr-4', author: "Physics Lab", upvotes: 14, body: "@Sam — yes! The larger the initial angle, the sooner the motion diverges. At small angles both pendulums are nearly linear and stay predictable longer. The chaos is fundamentally tied to the non-linearity of sin(θ) for large θ.", createdAt: ago(8 * m) },
    ],
  },
  {
    id: 'seed-video-2',
    title: "Watch: Energy Pendulum — Tracking KE and PE through the swing",
    body: `This Manim animation visualises a pendulum swing and shows exactly how kinetic energy (KE) and gravitational potential energy (PE) exchange throughout the motion.

What to look for:
• At the bottom of the swing — all energy is kinetic (max speed, zero height)
• At the top of each arc — all energy is potential (momentarily at rest, max height)
• Total energy stays constant (no air resistance)

KE + PE = constant → ½mv² + mgh = E_total

Exam question: A pendulum bob of 0.2 kg swings from rest at h = 0.4 m. Find its speed at the lowest point.
Answer: v = √(2gh) = √(2 × 10 × 0.4) = 2.83 m/s

Challenge: at what point does the bob have exactly 50% KE and 50% PE?`,
    author: "Physics Lab",
    createdAt: ago(5 * h),
    tags: ["#energy-conservation", "#pendulum", "#kinetic-energy", "#potential-energy", "#mechanics"],
    videoUrl: "/videos/clips/EnergyPendulum.mp4",
    upvotes: 39,
    replies: [
      { id: 'svr-5', author: "Lena W.",     upvotes: 21, body: "The 50/50 point is at h = h_max/2, right? KE = PE → ½mv² = mgh → v = √(gh). For h_max = 0.4m that's h = 0.2m, v = √(10 × 0.2) ≈ 1.41 m/s.", createdAt: ago(4 * h) },
      { id: 'svr-6', author: "Physics Lab", upvotes: 16, body: "Exactly right, Lena! At h = h_max/2, KE = PE. v = √(gh_max) = √(10 × 0.4) = 2 m/s at the 50/50 point. That's ~71% of max speed because KE ∝ v² — so 50% energy is only ~71% speed.", createdAt: ago(3.5 * h) },
      { id: 'svr-7', author: "Carlos B.",   upvotes: 7,  body: "Is this the same as SHM? The x-displacement vs time graph for a pendulum looks identical to the KE/PE graphs shown here.", createdAt: ago(2 * h) },
      { id: 'svr-8', author: "Priya N.",    upvotes: 11, body: "@Carlos — for small angles yes, a pendulum IS SHM because sin(θ) ≈ θ. The x-displacement is sinusoidal and KE/PE trade in exactly that pattern. For large angles it deviates from perfect SHM.", createdAt: ago(45 * m) },
    ],
  },
  {
    id: 'seed-video-3',
    title: "Watch: Projectile Motion — Separating horizontal and vertical",
    body: `This Manim animation shows a projectile launched at an angle, with the horizontal and vertical motion components tracked separately.

The key insight: the two axes are completely independent.

Horizontal: x = v₀ cos(θ) × t  →  constant velocity, zero acceleration
Vertical:   y = v₀ sin(θ) × t − ½gt²,  vᵧ = v₀ sin(θ) − gt

At max height: vᵧ = 0. Range is maximised at θ = 45°.

Exam question: A ball is launched at 20 m/s at 30° above horizontal.
(a) Time of flight: t_up = v₀sin(30°)/g = 10/10 = 1 s → total = 2 s
(b) Horizontal range: x = v₀cos(30°) × 2 = 20 × (√3/2) × 2 ≈ 34.6 m

Watch: can you identify the exact moment when vertical velocity hits zero?`,
    author: "Physics Lab",
    createdAt: ago(8 * h),
    tags: ["#projectile-motion", "#kinematics", "#vectors", "#equations-of-motion"],
    videoUrl: "/videos/clips/ProjectileMotion.mp4",
    upvotes: 31,
    replies: [
      { id: 'svr-9',  author: "Sam L.",      upvotes: 13, body: "The animation really clicks — I always forgot the horizontal velocity stays constant. Seeing the two components drawn side by side makes it obvious.", createdAt: ago(6 * h) },
      { id: 'svr-10', author: "Mei T.",      upvotes: 9,  body: "For the 45° thing — proved it using R = v₀²sin(2θ)/g. Sin(2θ) is max when 2θ = 90°, so θ = 45°. Elegant.", createdAt: ago(5 * h) },
      { id: 'svr-11', author: "Jake F.",     upvotes: 6,  body: "What changes if we account for air resistance? Does 45° still maximise range?", createdAt: ago(3 * h) },
      { id: 'svr-12', author: "Physics Lab", upvotes: 15, body: "@Jake — great question. With air resistance, the optimal angle drops below 45° (typically around 30–38° depending on drag). The drag force breaks the symmetry of the parabolic trajectory, so the math gets much harder — usually needs numerical methods.", createdAt: ago(2 * h) },
    ],
  },
  {
    id: 'seed-video-4',
    title: "Watch: Spring Oscillation — SHM and restoring force",
    body: `This Manim animation shows a mass on a spring undergoing simple harmonic motion (SHM).

The restoring force: F = −kx (Hooke's Law — negative sign means it always pulls back to equilibrium)

From F = ma: a = −(k/m)x — acceleration is proportional to displacement, opposite direction.

Key quantities:
• ω = √(k/m)     → angular frequency
• T = 2π√(m/k)  → period (independent of amplitude!)
• v_max = Aω     → max speed at x = 0

Exam: A spring k = 40 N/m, mass = 0.1 kg. Find the period.
T = 2π√(0.1/40) = 2π × 0.05 = 0.314 s

Notice: velocity is maximum at x = 0 and zero at x = ±A.`,
    author: "Physics Lab",
    createdAt: ago(14 * h),
    tags: ["#SHM", "#oscillations", "#waves", "#Hooke's-law", "#springs"],
    videoUrl: "/videos/clips/SpringOscillation.mp4",
    upvotes: 28,
    replies: [
      { id: 'svr-13', author: "Noah K.",     upvotes: 17, body: "This cleared up why the period doesn't depend on amplitude. I kept thinking a bigger swing should take longer, but T = 2π√(m/k) has no A. Mind = blown.", createdAt: ago(12 * h) },
      { id: 'svr-14', author: "Ava R.",      upvotes: 8,  body: "The negative sign in F = −kx confused me. The animation shows it perfectly: when x is positive (stretched), force points negative (back to centre). When x is negative (compressed), force is positive. Always restoring.", createdAt: ago(10 * h) },
      { id: 'svr-15', author: "Physics Lab", upvotes: 12, body: "Exactly, Ava. The negative sign is the whole point — it's what makes SHM oscillate rather than just accelerate away. Without it you'd have exponential growth, not oscillation.", createdAt: ago(9 * h) },
    ],
  },
  {
    id: 'seed-video-5',
    title: "Watch: Pulley System — Tension and Newton's 2nd Law",
    body: `This Manim animation demonstrates an Atwood machine — two masses over a frictionless pulley.

Key physics:
• Tension is the same throughout a massless rope
• Apply F = ma to each mass separately, then solve simultaneously

For masses m₁ and m₂:
• a = (m₁ − m₂)g / (m₁ + m₂)
• T = 2m₁m₂g / (m₁ + m₂)

Exam: m₁ = 3 kg, m₂ = 1 kg. Find acceleration and tension.
a = (3−1) × 10 / (3+1) = 5 m/s²
T = 2 × 3 × 1 × 10 / 4 = 15 N

Why does the lighter side still feel tension? The rope pulls it upward — without that, it would just free fall at g.`,
    author: "Physics Lab",
    createdAt: ago(1 * d),
    tags: ["#pulley", "#Newton's-laws", "#tension", "#forces", "#statics"],
    videoUrl: "/videos/clips/PulleySystem.mp4",
    upvotes: 22,
    replies: [
      { id: 'svr-16', author: "Zara H.",     upvotes: 10, body: "The animation showing the rope as one connected unit finally made tension click for me. Same tension on both sides = the rope doesn't stretch or compress.", createdAt: ago(20 * h) },
      { id: 'svr-17', author: "Finn O.",     upvotes: 8,  body: "For inclined plane pulleys — remember the component along the slope is mg sin(θ), not just mg. That trips people up in exams.", createdAt: ago(18 * h) },
      { id: 'svr-18', author: "Riya S.",     upvotes: 5,  body: "If the pulley has mass, does the tension change? We learned about moment of inertia but I never connected it to this.", createdAt: ago(10 * h) },
      { id: 'svr-19', author: "Physics Lab", upvotes: 13, body: "@Riya — yes! A massive pulley resists being spun (moment of inertia I = ½MR²). The two tensions are no longer equal — there's a net torque that accelerates the pulley's rotation. The system accelerates slower than the massless case.", createdAt: ago(8 * h) },
    ],
  },
  {
    id: 'seed-video-6',
    title: "Watch: Incline & Falling Ball — Gravity components on a slope",
    body: `This Manim animation compares free fall vs a ball sliding down a frictionless inclined plane side-by-side.

Free fall: only force = weight mg downward → a = g

On incline (angle θ):
• mg sin(θ) along slope → causes acceleration: a = g sin(θ)
• mg cos(θ) perpendicular → balanced by normal force N = mg cos(θ)

At θ = 90° → a = g sin(90°) = g → becomes free fall ✓
At θ = 0°  → a = 0 → flat surface, no motion ✓

Exam: 2 kg block on smooth 30° incline.
(a) a = g sin(30°) = 10 × 0.5 = 5 m/s²
(b) N = mg cos(30°) = 2 × 10 × (√3/2) ≈ 17.3 N

At what angle do the two motions look most similar?`,
    author: "Physics Lab",
    createdAt: ago(1.5 * d),
    tags: ["#inclined-plane", "#free-fall", "#Newton's-laws", "#forces", "#gravity"],
    videoUrl: "/videos/clips/InclineFallingBall.mp4",
    upvotes: 19,
    replies: [
      { id: 'svr-20', author: "Chloe B.", upvotes: 11, body: "g sin(θ) clicked when I thought of it as 'fraction of g along slope'. At 30°, sin(30°) = 0.5 → exactly half of gravity. Clean.", createdAt: ago(30 * h) },
      { id: 'svr-21', author: "Leo S.",   upvotes: 7,  body: "The side-by-side comparison is great. I never realised free fall at θ = 90° and incline are the same system — just different angles.", createdAt: ago(28 * h) },
    ],
  },

  // ── Discussion posts ──────────────────────────────────────────────────────
  {
    id: 'seed-t1',
    title: "Why does an object in free fall keep accelerating if g is constant?",
    body: "I understand g = 9.8 m/s² is constant, but I don't get why the object keeps speeding up instead of falling at a fixed speed. Isn't a constant force supposed to give constant velocity?",
    author: "Alice K.",
    createdAt: ago(12 * h),
    tags: ["#free-fall", "#Newton's-laws", "#acceleration", "#gravity"],
    videoUrl: null, upvotes: 34,
    replies: [
      { id: 'str-1', author: "Ben T.",   upvotes: 28, body: "A constant force gives constant *acceleration*, not constant velocity. Newton's 2nd: F = ma → constant F means constant a. The velocity keeps increasing because a is the rate of change of v. You're confusing force with velocity.", createdAt: ago(10 * h) },
      { id: 'str-2', author: "Mei T.",   upvotes: 15, body: "Think of it this way: if you push someone on a skateboard with a constant force, do they go at constant speed? No — they accelerate. Gravity is just a constant push downwards.", createdAt: ago(9 * h) },
      { id: 'str-3', author: "Alice K.", upvotes: 6,  body: "Oh wow that makes total sense. So constant force = constant *rate of change* of velocity. Thanks both!", createdAt: ago(8 * h) },
    ],
  },
  {
    id: 'seed-t2',
    title: "v² = u² + 2as vs v = u + at — how do I pick the right one?",
    body: "I keep mixing up the kinematic equations and wasting time in exams trying both. Is there a systematic way to choose?",
    author: "Priya M.",
    createdAt: ago(1 * d),
    tags: ["#kinematics", "#equations-of-motion", "#problem-solving", "#exam-tips"],
    videoUrl: null, upvotes: 52,
    replies: [
      { id: 'str-4', author: "James R.", upvotes: 38, body: "List your knowns and the variable you want. The four equations each have a different 'missing' variable:\n• v = u + at  → missing s\n• s = ut + ½at²  → missing v\n• v² = u² + 2as  → missing t\n• s = ½(u+v)t  → missing a\n\nFind which variable you don't need and pick the equation that doesn't contain it.", createdAt: ago(22 * h) },
      { id: 'str-5', author: "Noah K.",  upvotes: 14, body: "Memorise it as the 'missing variable' method. Check what's not given AND not asked for — that's the missing one, and that tells you which SUVAT to use.", createdAt: ago(20 * h) },
      { id: 'str-6', author: "Priya M.", upvotes: 9,  body: "This is genuinely the most useful thing I've learned this term. Saving this forever.", createdAt: ago(18 * h) },
    ],
  },
  {
    id: 'seed-t3',
    title: "Why does current split in a parallel circuit but not in series?",
    body: "In series the current is the same everywhere, but in parallel it splits. I don't fully get why — the electrons are just flowing through metal either way, right?",
    author: "Chris W.",
    createdAt: ago(2 * d),
    tags: ["#electricity", "#circuits", "#parallel", "#current", "#Ohm's-law"],
    videoUrl: null, upvotes: 26,
    replies: [
      { id: 'str-7', author: "Ava R.",  upvotes: 19, body: "Think of current as a flow of water. In series, there's only one pipe — all water flows through it. In parallel, the pipe splits into branches — the water divides between them. More branches = more paths = total current is the sum of branch currents.", createdAt: ago(44 * h) },
      { id: 'str-8', author: "Sam L.",  upvotes: 10, body: "Kirchhoff's Current Law: the current entering a node equals the current leaving it. In parallel, the junction is that node. Electrons literally split to take all available paths.", createdAt: ago(40 * h) },
      { id: 'str-9', author: "Chris W.", upvotes: 5, body: "The water pipe analogy is perfect. So voltage across each branch stays the same but the current splits — that's why parallel devices don't dim each other.", createdAt: ago(36 * h) },
    ],
  },
  {
    id: 'seed-t4',
    title: "What's the difference between weight and mass? Everyone says it but I still confuse them",
    body: "My teacher keeps saying 'mass is not weight' but on Earth they seem interchangeable. When does it actually matter?",
    author: "Jordan L.",
    createdAt: ago(3 * d),
    tags: ["#gravity", "#forces", "#Newton's-laws", "#fundamentals"],
    videoUrl: null, upvotes: 61,
    replies: [
      { id: 'str-10', author: "Finn O.",  upvotes: 44, body: "Mass: how much matter is in an object (kg). It's the same everywhere — on Earth, Moon, or in space.\n\nWeight: the gravitational force on that mass (N). W = mg.\n\nOn Earth g = 9.8 m/s² so a 10 kg mass weighs 98 N.\nOn the Moon g = 1.6 m/s² so that SAME 10 kg mass weighs only 16 N.\n\nMass never changes. Weight depends on where you are.", createdAt: ago(70 * h) },
      { id: 'str-11', author: "Chloe B.", upvotes: 22, body: "The practical difference: if you're designing a spacecraft, you need the *mass* (inertia, fuel requirements). If you're calculating how hard the ground pushes up on you, you need the *weight* (force downwards).", createdAt: ago(65 * h) },
      { id: 'str-12', author: "Jordan L.", upvotes: 8, body: "Oh so weight is literally just a force — measured in Newtons! That changes everything. My teacher said 'I weigh 70 kg' and I thought that was weight but it's actually mass.", createdAt: ago(60 * h) },
    ],
  },
  {
    id: 'seed-t5',
    title: "How do I find the resultant of two forces that aren't at 90°?",
    body: "When forces are perpendicular I can use Pythagoras. But what do I do when the angle between them is like 60° or 120°? Parallelogram law?",
    author: "Riya S.",
    createdAt: ago(4 * d),
    tags: ["#forces", "#vectors", "#resultant", "#trigonometry", "#mechanics"],
    videoUrl: null, upvotes: 33,
    replies: [
      { id: 'str-13', author: "Carlos B.", upvotes: 25, body: "Two methods:\n\n1. Parallelogram law (visual): draw both forces from same point, complete the parallelogram — the diagonal is the resultant.\n\n2. Component method (exam-safe):\n   • Resolve each force into x and y components using cos and sin\n   • Add all x-components: Fₓ = F₁cos(θ₁) + F₂cos(θ₂)\n   • Add all y-components: Fᵧ = F₁sin(θ₁) + F₂sin(θ₂)\n   • Resultant magnitude: R = √(Fₓ² + Fᵧ²)\n   • Angle: φ = arctan(Fᵧ/Fₓ)\n\nComponent method works for any number of forces and any angles.", createdAt: ago(90 * h) },
      { id: 'str-14', author: "Riya S.",   upvotes: 11, body: "The component method is so clean. I was trying to remember the cosine rule formula and getting confused. Breaking into x and y is way more reliable.", createdAt: ago(85 * h) },
    ],
  },
  {
    id: 'seed-t6',
    title: "Snell's law — why does light bend when it hits a different medium?",
    body: "I can apply n₁sin(θ₁) = n₂sin(θ₂) but I don't understand *why* light bends. What physically causes it?",
    author: "Mei T.",
    createdAt: ago(5 * d),
    tags: ["#light", "#refraction", "#Snell's-law", "#optics", "#waves"],
    videoUrl: null, upvotes: 44,
    replies: [
      { id: 'str-15', author: "Physics Lab", upvotes: 31, body: "The classic analogy: imagine a marching band crossing from grass to concrete at an angle. The column that hits concrete first speeds up while the rest are still on grass. This difference in speed across the wavefront causes the whole band to turn.\n\nLight does the same thing — its phase velocity changes in different media (v = c/n). The part of the wavefront entering the new medium first speeds up or slows down, causing the wave to bend. Snell's law is derived from this wavefront geometry.", createdAt: ago(118 * h) },
      { id: 'str-16', author: "Ava R.",      upvotes: 15, body: "Fermat's Principle also explains it elegantly: light takes the path of least *time* (not distance) between two points. Through different media, the shortest-time path is a bent one. Snell's law falls out naturally from minimising travel time.", createdAt: ago(110 * h) },
      { id: 'str-17', author: "Mei T.",      upvotes: 9,  body: "The marching band one is the best explanation I've ever heard for this. Thank you — I'm going to use that in my notes.", createdAt: ago(105 * h) },
    ],
  },
  {
    id: 'seed-t7',
    title: "Half-life confusion — if atoms randomly decay, how is the half-life constant?",
    body: "Each individual atom decays randomly. So how can we predict that exactly half will decay in a fixed time? Doesn't that require knowing which ones will decay?",
    author: "Sam O.",
    createdAt: ago(6 * d),
    tags: ["#atoms", "#radioactive-decay", "#half-life", "#nuclear", "#probability"],
    videoUrl: null, upvotes: 57,
    replies: [
      { id: 'str-18', author: "Physics Lab", upvotes: 40, body: "This is a beautiful question about the law of large numbers.\n\nYou're right that each individual atom decays randomly — you genuinely can't predict when any one atom will decay. But half-life is a *statistical* property of a huge population.\n\nIf each atom has a 50% chance of decaying in time T, then in a sample of 10²³ atoms, statistically ~5×10²² will have decayed after time T. The randomness averages out at scale. The more atoms, the more precisely the half-life holds.\n\nFor tiny samples (a few hundred atoms), the actual decay rate would fluctuate noticeably — the half-life is only an average.", createdAt: ago(140 * h) },
      { id: 'str-19', author: "James R.", upvotes: 18, body: "Same reason a coin flip gives exactly 50% heads only on average over many flips. Flip 4 coins and you might get 3 heads. Flip 4 million and you'll get almost exactly 2 million heads.", createdAt: ago(135 * h) },
      { id: 'str-20', author: "Sam O.",   upvotes: 12, body: "The coin flip analogy is perfect. So for radiocarbon dating with 10²³ atoms, the statistics are so tight that the half-life is effectively exact. And the model breaks down for tiny samples.", createdAt: ago(130 * h) },
    ],
  },
  {
    id: 'seed-t8',
    title: "Why does a spinning top not fall over? (torque + angular momentum)",
    body: "A stationary top falls instantly. A spinning top stays upright and precesses. Why? What exactly is 'precession' and how does angular momentum prevent falling?",
    author: "Leo S.",
    createdAt: ago(7 * d),
    tags: ["#rotational-motion", "#angular-momentum", "#torque", "#mechanics", "#gyroscope"],
    videoUrl: null, upvotes: 48,
    replies: [
      { id: 'str-21', author: "Carlos B.",   upvotes: 35, body: "Angular momentum L is a vector pointing along the spin axis. Gravity exerts a torque τ on the tilted top. Newton's 2nd for rotation: τ = dL/dt — torque changes L, but since τ is perpendicular to L (gravity pulls down, L points sideways), it doesn't reduce the magnitude of L, it rotates the direction of L. The top's axis sweeps out a cone — that's precession.\n\nPrecession rate: Ω = mgr / (Iω), where r is the distance from pivot to CM, I is moment of inertia, ω is spin rate. Faster spin = slower precession.", createdAt: ago(165 * h) },
      { id: 'str-22', author: "Physics Lab", upvotes: 22, body: "The intuition: angular momentum 'resists' changes to its direction. Gravity tries to tip the axis, but instead of falling, the axis deflects sideways (because τ is perpendicular to L). It's the same reason a bicycle stays upright when moving — gyroscopic precession from the wheels.", createdAt: ago(160 * h) },
    ],
  },
]

function initPosts() {
  const existing = loadPosts()
  // Only seed if some seed posts are missing
  const hasAll = SEED_IDS.every(id => existing.some(p => p.id === id))
  if (!hasAll) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_POSTS))
    return SEED_POSTS
  }
  return existing
}

// ─── Server sync helpers ──────────────────────────────────────────────────────

async function syncAddPostToServer(post) {
  try {
    await apiFetch('/api/forum/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(post),
    })
  } catch {} // localStorage is the source of truth — server sync is best-effort
}

async function syncAddReplyToServer(postId, reply) {
  try {
    await apiFetch(`/api/forum/posts/${postId}/replies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reply),
    })
  } catch {}
}

async function syncUpvoteToServer(postId, userId) {
  try {
    await apiFetch(`/api/forum/posts/${postId}/upvote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
  } catch {}
}

/**
 * Attempt to load posts from the server on first mount.
 * Falls back to localStorage SEED_POSTS if the server is unavailable.
 */
async function fetchPostsFromServer() {
  try {
    const res = await apiFetch('/api/forum/posts')
    if (!res.ok) throw new Error()
    const serverPosts = await res.json()
    if (Array.isArray(serverPosts) && serverPosts.length > 0) {
      // Merge: server posts + local posts not yet on server
      const local = loadPosts()
      const serverIds = new Set(serverPosts.map(p => p.id))
      const localOnly = local.filter(p => !serverIds.has(p.id) && !SEED_IDS.includes(p.id))
      const merged = [...serverPosts, ...localOnly]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
      return merged
    }
  } catch {}
  return null
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useForum() {
  const [posts,   setPosts]   = useState(() => initPosts())
  const [upvoted, setUpvoted] = useState(() => loadUpvoted())
  const [loading, setLoading] = useState(true)

  // On mount, try to pull fresh posts from the server (min 600ms so skeleton is visible)
  useEffect(() => {
    const minDelay = new Promise(r => setTimeout(r, 600))
    Promise.all([fetchPostsFromServer(), minDelay])
      .then(([serverPosts]) => { if (serverPosts) setPosts(serverPosts) })
      .finally(() => setLoading(false))
  }, [])

  // Sync from localStorage whenever another instance mutates it
  useEffect(() => {
    const sync = () => {
      setPosts(loadPosts())
      setUpvoted(loadUpvoted())
    }
    window.addEventListener('storage', sync)
    window.addEventListener(SYNC_EVENT, sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener(SYNC_EVENT, sync)
    }
  }, [])

  // ── Upvote a post ─────────────────────────────────────────────────────────
  // No deps → stable reference. We read fresh data from localStorage each call
  // to avoid stale-closure issues without depending on React state.
  const upvotePost = useCallback((postId) => {
    const currentUpvoted = loadUpvoted()
    const wasUpvoted = currentUpvoted.has(postId)
    wasUpvoted ? currentUpvoted.delete(postId) : currentUpvoted.add(postId)

    const currentPosts = loadPosts()
    const nextPosts = currentPosts.map(p =>
      p.id === postId
        ? { ...p, upvotes: (p.upvotes ?? 0) + (wasUpvoted ? -1 : 1) }
        : p
    )

    // One write, one event
    persistAll(nextPosts, currentUpvoted)
    setPosts(nextPosts)
    setUpvoted(new Set(currentUpvoted))
    syncUpvoteToServer(postId, 'local-user') // best-effort
  }, []) // stable — no deps on React state

  // ── Upvote a reply ────────────────────────────────────────────────────────
  const upvoteReply = useCallback((postId, replyId) => {
    const key = `${postId}:${replyId}`
    const currentUpvoted = loadUpvoted()
    const wasUpvoted = currentUpvoted.has(key)
    wasUpvoted ? currentUpvoted.delete(key) : currentUpvoted.add(key)

    const currentPosts = loadPosts()
    const nextPosts = currentPosts.map(p =>
      p.id === postId
        ? {
            ...p,
            replies: p.replies.map(r =>
              r.id === replyId
                ? { ...r, upvotes: (r.upvotes ?? 0) + (wasUpvoted ? -1 : 1) }
                : r
            ),
          }
        : p
    )

    persistAll(nextPosts, currentUpvoted)
    setPosts(nextPosts)
    setUpvoted(new Set(currentUpvoted))
  }, []) // stable

  // ── Add post ──────────────────────────────────────────────────────────────
  const addPost = useCallback((title, body, tags, author = 'Student', videoUrl = null, caseId = null) => {
    const newPost = {
      id: generateId(), title, body, author,
      createdAt: new Date().toISOString(),
      tags, videoUrl, upvotes: 0, replies: [],
      ...(caseId ? { case_id: caseId } : {}),
    }
    setPosts(prev => {
      const next = [newPost, ...prev]
      persistAll(next, undefined)
      return next
    })
    syncAddPostToServer(newPost) // best-effort server sync
    return newPost.id
  }, [])

  // ── Add reply ─────────────────────────────────────────────────────────────
  const addReply = useCallback((postId, body, author = 'Student') => {
    const newReply = {
      id: generateId(), author, body, upvotes: 0,
      createdAt: new Date().toISOString(),
    }
    setPosts(prev => {
      const next = prev.map(p =>
        p.id === postId ? { ...p, replies: [...p.replies, newReply] } : p
      )
      persistAll(next, undefined)
      return next
    })
    syncAddReplyToServer(postId, newReply) // best-effort server sync
  }, [])

  const getPost    = useCallback((id) => posts.find(p => p.id === id) ?? null, [posts])
  const hasUpvoted = useCallback((key) => upvoted.has(key), [upvoted])

  const getPostsForCase = useCallback((caseId) => {
    if (!caseId) return []
    return posts.filter(p => p.case_id === caseId).sort((a, b) => (b.upvotes ?? 0) - (a.upvotes ?? 0))
  }, [posts])

  const findRelated = useCallback((keywords) => {
    if (!keywords?.length) return []
    const lower = keywords.map(k => k.toLowerCase())
    return posts
      .filter(p => p.tags?.some(tag => lower.some(kw => tag.toLowerCase().includes(kw))))
      .slice(0, 3)
  }, [posts])

  return { posts, loading, upvoted, upvotePost, upvoteReply, hasUpvoted, addPost, addReply, getPost, getPostsForCase, findRelated }
}
