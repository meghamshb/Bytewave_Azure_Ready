import { Link, useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState, useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
import Spline from '@splinetool/react-spline'
import { useHoldActivation } from '../hooks/useHoldActivation'
import HoldOverlay from '../components/HoldOverlay'
import HeroDashboard from '../components/HeroDashboard'
import ThemeToggle from '../components/ThemeToggle'
import WaveMark from '../components/WaveMark'
import { useBlackHoleTransition } from '../components/BlackHoleTransition'

// Detect mobile once at module level — no re-renders
const IS_MOBILE = typeof window !== 'undefined' && window.innerWidth < 768

// ─── Constants ────────────────────────────────────────────────────────────────
const HEADER_H = 58     // px — keep in sync with header height below

// ─── Header ──────────────────────────────────────────────────────────────────
// Over the hero: fully transparent, all text white.
// After scrolling past the hero: glass bg + text switches to theme colour.
// Uses direct DOM writes — zero re-renders on every scroll tick.
function LandingHeader() {
  const wrapRef    = useRef(null)
  const navRef     = useRef(null)
  const logoRef    = useRef(null)
  const scrolled   = useRef(false)

  useEffect(() => {
    const wrap = wrapRef.current
    const nav  = navRef.current
    const logo = logoRef.current
    if (!wrap || !nav || !logo) return

    const applyScrolled = (isScrolled) => {
      if (isScrolled) {
        wrap.style.background   = 'var(--bg-glass)'
        wrap.style.borderBottom = '1px solid var(--border-light)'
        wrap.style.boxShadow    = '0 1px 0 var(--border-light), 0 4px 24px rgba(0,0,0,0.08)'
        logo.style.color        = 'var(--primary-text)'
        nav.dataset.scrolled    = 'true'
        nav.querySelectorAll('.nav-link').forEach(el => {
          el.style.color = 'var(--primary-text-muted)'
        })
      } else {
        wrap.style.background   = 'transparent'
        wrap.style.borderBottom = '1px solid transparent'
        wrap.style.boxShadow    = 'none'
        logo.style.color        = '#fff'
        nav.dataset.scrolled    = 'false'
        nav.querySelectorAll('.nav-link').forEach(el => {
          el.style.color = 'rgba(255,255,255,0.72)'
        })
      }
    }

    const onScroll = () => {
      const isScrolled = window.scrollY > window.innerHeight * 0.65
      if (isScrolled !== scrolled.current) {
        scrolled.current = isScrolled
        applyScrolled(isScrolled)
      }
    }

    applyScrolled(false)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const makeLink = ({ label, href, isAnchor }) => {
    const props = {
      className: 'nav-link',
      style: {
        color: 'rgba(255,255,255,0.72)',
        textDecoration: 'none',
        fontSize: 13, fontWeight: 600,
        padding: '6px 14px', borderRadius: 8,
        transition: 'background 0.15s, color 0.15s',
      },
      onMouseEnter: e => {
        const dark = navRef.current?.dataset.scrolled === 'true'
        e.currentTarget.style.background = dark ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.1)'
        e.currentTarget.style.color      = dark ? 'var(--primary-text)' : '#fff'
      },
      onMouseLeave: e => {
        const dark = navRef.current?.dataset.scrolled === 'true'
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.color      = dark ? 'var(--primary-text-muted)' : 'rgba(255,255,255,0.72)'
      },
    }
    return isAnchor
      ? <a key={label} href={href} {...props}>{label}</a>
      : <Link key={label} to={href} {...props}>{label}</Link>
  }

  return (
    <div
      ref={wrapRef}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
        backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
        transition: 'background 0.35s ease, border-color 0.35s ease, box-shadow 0.35s ease',
      }}
    >
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: HEADER_H, padding: '0 32px',
        maxWidth: 1200, margin: '0 auto', gap: 24,
      }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', flexShrink: 0 }}>
          <WaveMark />
          <span ref={logoRef} style={{
            fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700,
            color: '#fff', letterSpacing: '-0.02em',
            transition: 'color 0.35s ease',
          }}>Byte Wave</span>
        </Link>

        <nav ref={navRef} data-scrolled="false" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {[
            { label: 'How it works', href: '#how-it-works', isAnchor: true },
            { label: 'AI Chat',      href: '/chat' },
            { label: 'Community',    href: '/forum' },
          ].map(makeLink)}

          <ThemeToggle />

          <Link
            to="/learn"
            onMouseEnter={() => {
              import('./Home').catch(() => {})
              import('../components/LearnLayout').catch(() => {})
            }}
            style={{
              padding: '7px 18px', borderRadius: 8,
              background: 'var(--gradient-accent)', color: '#fff',
              fontSize: 13, fontWeight: 600, textDecoration: 'none',
              boxShadow: '0 2px 8px rgba(99,102,241,0.4)', flexShrink: 0,
            }}
          >Get started →</Link>
        </nav>
      </header>
    </div>
  )
}


// ─── Spline hero — full-screen interactive 3D scene ──────────────────────────
// Hold events are captured at the parent <section> level (capture phase),
// so SplineHero is purely responsible for: loading the scene, clamping zoom,
// fading in, and pausing when the tab is hidden.
function SplineHero() {
  const appRef     = useRef(null)
  const cleanupRef = useRef(null)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  const DESIGN_W     = 1440
  const DESIGN_H     = 900
  const MIN_DISTANCE = 3
  const MAX_DISTANCE = 8

  const handleLoad = useCallback((splineApp) => {
    appRef.current = splineApp

    const canvas   = splineApp.renderer?.domElement ?? null
    const controls = splineApp.controls ?? splineApp._controls ?? null

    // ── Lock canvas to fixed resolution ──────────────────────────────────────
    // Spline normally matches canvas px size to viewport * DPR on every resize,
    // burning GPU cycles.  We set it once and disconnect its resize observer so
    // the render resolution never changes again.  CSS `width/height: 100%` on
    // the canvas handles the visual upscale/downscale at zero compute cost.
    try { splineApp.setSize(DESIGN_W, DESIGN_H) } catch {}
    try {
      // Spline ≥ 0.9 exposes _ro (ResizeObserver) or _resizeObserver
      ;(splineApp._ro ?? splineApp._resizeObserver)?.disconnect()
    } catch {}
    try {
      // Remove any window 'resize' listener Spline may have added
      if (typeof splineApp._onResize === 'function') {
        window.removeEventListener('resize', splineApp._onResize)
      }
    } catch {}

    // Force canvas CSS to always fill the container (visual scaling only)
    if (canvas) {
      canvas.style.width  = '100%'
      canvas.style.height = '100%'
      canvas.style.objectFit = 'cover'
    }

    // ── Zoom clamp ───────────────────────────────────────────────────────────
    if (controls) {
      try {
        controls.enableZoom  = true
        controls.minDistance = MIN_DISTANCE
        controls.maxDistance = MAX_DISTANCE
        controls.update?.()
      } catch {}

      // Wheel intercept — prevent scrolling past zoom limits
      if (canvas) {
        const onWheel = (e) => {
          const dist =
            controls.getDistance?.() ??
            controls.object?.position?.distanceTo?.(controls.target) ??
            null
          if (dist === null) return
          if ((e.deltaY < 0 && dist <= MIN_DISTANCE + 0.05) ||
              (e.deltaY > 0 && dist >= MAX_DISTANCE - 0.05)) {
            e.preventDefault()
          }
        }
        canvas.addEventListener('wheel', onWheel, { passive: false })
        cleanupRef.current = () => canvas.removeEventListener('wheel', onWheel)
      }
    }

    setLoaded(true)
  }, [])

  const handleError = useCallback(() => setFailed(true), [])

  useEffect(() => {
    const onVisibility = () => {
      const app = appRef.current
      if (!app) return
      try { document.hidden ? app.stop() : app.play() } catch {}
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      cleanupRef.current?.()
    }
  }, [])

  if (IS_MOBILE || failed) return <CSSFallbackBG />

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#060614', overflow: 'hidden' }}>
      {/* Skeleton gradient while Spline downloads */}
      {!loaded && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(99,102,241,0.18) 0%, rgba(139,92,246,0.08) 45%, transparent 70%)',
        }} />
      )}

      {/* Canvas wrapper — native pointer listeners attached in handleLoad */}
      <div style={{
        position: 'absolute', inset: 0,
        opacity:    loaded ? 1 : 0,
        transition: 'opacity 1s ease',
      }}>
        <Spline
          scene="https://prod.spline.design/AYTDT5DSdS2a1fVN/scene.splinecode"
          onLoad={handleLoad}
          onError={handleError}
          style={{ width: '100%', height: '100%', display: 'block' }}
        />
      </div>
    </div>
  )
}

// Lightweight pure-CSS fallback shown only if Spline CDN is unreachable
function CSSFallbackBG() {
  return (
    <>
      <div style={{
        position: 'absolute', width: '90vw', height: '90vw',
        maxWidth: 1000, maxHeight: 1000, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, rgba(99,102,241,0.04) 45%, transparent 70%)',
        top: '50%', left: '50%', transform: 'translate(-50%, -58%)', pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', width: '55vw', height: '55vw',
        maxWidth: 650, maxHeight: 650, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(139,92,246,0.11) 0%, transparent 65%)',
        bottom: '0%', right: '-8%', willChange: 'transform',
        animation: 'css-orb 22s ease-in-out infinite', pointerEvents: 'none',
      }} />
      {['F = ma','E = mc²','v = fλ','p = mv','ω = 2πf'].map((t, i) => (
        <span key={t} style={{
          position: 'absolute',
          left: `${10 + i * 18}%`, top: `${20 + (i % 3) * 25}%`,
          color: 'rgba(129,140,248,0.18)', fontFamily: 'monospace',
          fontSize: 12, fontWeight: 600, letterSpacing: '0.05em',
          animation: `css-float ${12 + i * 1.5}s ${i * 1.2}s ease-in-out infinite`,
          pointerEvents: 'none', userSelect: 'none',
        }}>{t}</span>
      ))}
    </>
  )
}

// ─── Landing page ────────────────────────────────────────────────────────────
export default function Landing() {
  const { overlay } = useBlackHoleTransition()

  // ── Hold activation ────────────────────────────────────────────────────────
  const { isHolding, activated, progress, startHold, cancelHold, reset } =
    useHoldActivation({ duration: 800 })

  // Stable refs — capture-phase listeners always call the latest fn version
  const startHoldRef  = useRef(null)
  const cancelHoldRef = useRef(null)
  startHoldRef.current  = startHold   // update every render, no effect needed
  cancelHoldRef.current = cancelHold

  // Ref to the hero section DOM node
  const heroRef = useRef(null)

  // Attach native CAPTURE-PHASE pointer listeners to the hero section.
  // Capture phase fires BEFORE any child handler (including Spline internals),
  // so stopPropagation() inside Spline cannot block these.
  useEffect(() => {
    const el = heroRef.current
    if (!el) return

    const onDown = () => {
      import('./LandingReveal').catch(() => {})
      import('./Home').catch(() => {})
      import('../components/LearnLayout').catch(() => {})
      startHoldRef.current?.()
    }
    const onUp = () => cancelHoldRef.current?.()

    // true = useCapture — runs before ANY child listener
    el.addEventListener('pointerdown',  onDown, true)
    el.addEventListener('pointerup',    onUp,   true)
    el.addEventListener('pointerleave', onUp,   false)  // leave doesn't bubble anyway

    return () => {
      el.removeEventListener('pointerdown',  onDown, true)
      el.removeEventListener('pointerup',    onUp,   true)
      el.removeEventListener('pointerleave', onUp,   false)
    }
  }, []) // empty — uses refs, so always fresh

  const showDashboard = activated

  return (
    <div style={{ background: '#060614', height: '100dvh', overflow: 'hidden' }}>
      {overlay}

      <LandingHeader />

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* HERO — full-screen Spline 3D scene                                    */}
      {/* Press-and-hold 800ms → activates in-place dashboard overlay           */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <section
        ref={heroRef}
        style={{
          position: 'relative',
          width: '100%',
          height: '100dvh',
          minHeight: 500,
          overflow: 'hidden',
          background: '#060614',
          cursor: activated ? 'default' : 'grab',
          userSelect: 'none',
        }}
      >
        {/* Spline canvas — hold events captured at section level via useEffect */}
        <SplineHero />

        {/*
          PART 3 scrim: React owns the blur overlay, NOT the canvas.
          Spline animates its own objects; React just darkens the background
          so the dashboard can overlay cleanly.
        */}
        {showDashboard && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 8,
            background: 'rgba(6,6,20,0.65)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            pointerEvents: 'none',
            transition: 'opacity 0.4s ease',
          }} />
        )}

        {/* Radial hold-progress ring — centred over the Spline scene */}
        <HoldOverlay
          isHolding={isHolding}
          activated={showDashboard}
          progress={progress}
        />

        {/* Value prop text — fades out when dashboard activates */}
        <div style={{
          position:   'absolute', bottom: 0, left: 0, right: 0,
          padding:    '0 32px 80px',
          background: 'linear-gradient(to top, rgba(6,6,20,0.92) 0%, rgba(6,6,20,0.5) 55%, transparent 100%)',
          pointerEvents: 'none',
          display:    'flex', flexDirection: 'column', alignItems: 'center',
          textAlign:  'center',
          zIndex:     5,
          // Fade out when activated; GPU opacity transition
          opacity:    showDashboard ? 0 : 1,
          transition: 'opacity 0.4s ease',
        }}>
          <h1 style={{
            fontFamily:   'var(--font-display)',
            fontSize:     'clamp(28px, 4.5vw, 56px)',
            fontWeight:   800, lineHeight: 1.1,
            color:        '#fff', margin: '0 0 14px',
            letterSpacing: '-0.03em',
            textShadow:   '0 2px 40px rgba(6,6,20,0.8)',
          }}>
            Your AI physics tutor.<br />
            <span style={{
              background:           'linear-gradient(135deg, #818cf8, #a78bfa)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor:  'transparent',
            }}>Knows exactly what you don't.</span>
          </h1>
          <p style={{
            fontSize:  'clamp(13px, 1.4vw, 16px)',
            lineHeight: 1.65,
            color:     'rgba(255,255,255,0.6)',
            margin:     0,
            maxWidth:   460,
          }}>
            Answer real physics cases. The AI pinpoints your gaps and tells you precisely what to review next.
          </p>
          {/* Hold hint — appears only when not holding and not activated */}
          {!isHolding && !activated && (
            <p style={{
              marginTop:    16,
              fontSize:     11,
              fontWeight:   600,
              letterSpacing: '0.08em',
              color:        'rgba(129,140,248,0.55)',
              textTransform: 'uppercase',
            }}>
              Press &amp; hold anywhere to explore
            </p>
          )}
        </div>

        {/* Hold cue arrow — points down, replaced scroll cue */}
        {!showDashboard && (
          <div
            aria-hidden="true"
            style={{
              position:   'absolute', bottom: 28, left: '50%',
              transform:  'translateX(-50%)',
              display:    'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              color:      'rgba(129,140,248,0.45)', fontSize: 10, fontWeight: 700,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              pointerEvents: 'none',
              animation:  'scroll-bob 2.2s ease-in-out infinite',
            }}
          >
            hold to reveal
            <svg width={14} height={14} viewBox="0 0 14 14" fill="none">
              <path d="M7 1v12M3 9l4 4 4-4"
                stroke="currentColor" strokeWidth={1.4}
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}

        {/* Dashboard — mounts in-place with Framer Motion, AnimatePresence handles exit */}
        <AnimatePresence>
          {showDashboard && (
            <HeroDashboard key="hero-dashboard" onClose={reset} />
          )}
        </AnimatePresence>

        <style>{`
          @keyframes scroll-bob {
            0%,100% { transform: translateX(-50%) translateY(0); }
            50%      { transform: translateX(-50%) translateY(5px); }
          }
        `}</style>
      </section>

      <style>{`
        @keyframes scroll-bob {
          0%,100% { transform: translateX(-50%) translateY(0);   opacity: 0.3; }
          50%      { transform: translateX(-50%) translateY(5px); opacity: 0.6; }
        }
      `}</style>
    </div>
  )
}
