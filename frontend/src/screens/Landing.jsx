import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState, useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
import Spline from '@splinetool/react-spline'
import { useHoldActivation } from '../hooks/useHoldActivation'
import HeroDashboard from '../components/HeroDashboard'
import WaveMark from '../components/WaveMark'

// Detect mobile once at module level — no re-renders
const IS_MOBILE = typeof window !== 'undefined' && window.innerWidth < 768

// ─── Constants ────────────────────────────────────────────────────────────────
const HEADER_H = 58     // px — keep in sync with header height below

// ─── Header ──────────────────────────────────────────────────────────────────
// Over the hero: fully transparent, all text white.
// After scrolling past the hero: glass bg + text switches to theme colour.
// Uses direct DOM writes — zero re-renders on every scroll tick.
function LandingHeader({ onHashNav }) {
  const navigate   = useNavigate()
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

  const linkStyle = {
    className: 'nav-link',
    style: {
      color: 'rgba(255,255,255,0.72)',
      textDecoration: 'none',
      fontSize: 13, fontWeight: 600,
      padding: '6px 14px', borderRadius: 8,
      transition: 'background 0.15s, color 0.15s',
      cursor: 'pointer', background: 'none', border: 'none',
      fontFamily: 'inherit',
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
          <button
            {...linkStyle}
            onClick={() => onHashNav('#how-it-works')}
          >How it works</button>
          <button
            onClick={() => navigate('/auth')}
            onMouseEnter={() => {
              import('./Home').catch(() => {})
              import('../components/LearnLayout').catch(() => {})
            }}
            style={{
              padding: '7px 18px', borderRadius: 8,
              background: 'var(--gradient-accent)', color: '#fff',
              fontSize: 13, fontWeight: 600, border: 'none',
              cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: '0 2px 8px rgba(99,102,241,0.4)', flexShrink: 0,
            }}
          >Sign Up →</button>
        </nav>
      </header>
    </div>
  )
}


// ─── Spline hero — interactive 3D scene with locked camera ──────────────────
// Animations and hover/click interactions stay enabled.
// Camera zoom, pan, and orbit are fully disabled so the framing never changes.
// Wheel/touchpad events are blocked on the canvas to prevent scroll-zoom.
function SplineHero() {
  const appRef     = useRef(null)
  const cleanupRef = useRef(null)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  const DESIGN_W = 1440
  const DESIGN_H = 900

  const handleLoad = useCallback((splineApp) => {
    appRef.current = splineApp

    const canvas   = splineApp.renderer?.domElement ?? null
    const controls = splineApp.controls ?? splineApp._controls ?? null

    // Lock canvas to fixed resolution
    try { splineApp.setSize(DESIGN_W, DESIGN_H) } catch {}
    try { (splineApp._ro ?? splineApp._resizeObserver)?.disconnect() } catch {}
    try {
      if (typeof splineApp._onResize === 'function')
        window.removeEventListener('resize', splineApp._onResize)
    } catch {}

    if (canvas) {
      canvas.style.width     = '100%'
      canvas.style.height    = '100%'
      canvas.style.objectFit = 'cover'
    }

    // ── Lock camera — disable zoom / orbit / pan ──────────────────────────
    if (controls) {
      try {
        controls.enableZoom    = false
        controls.enableRotate  = false
        controls.enablePan     = false
        controls.enableDamping = false
        controls.update?.()
      } catch {}
    }

    // Block wheel/touchpad on the canvas so it can't zoom the scene
    if (canvas) {
      const blockWheel = (e) => { e.preventDefault(); e.stopPropagation() }
      canvas.addEventListener('wheel', blockWheel, { passive: false, capture: true })
      cleanupRef.current = () => canvas.removeEventListener('wheel', blockWheel, { capture: true })
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
    <div style={{
      position: 'absolute', inset: 0,
      background: '#060614',
      overflow: 'hidden',
      maskImage:       'linear-gradient(to bottom, black 0%, black 55%, transparent 92%)',
      WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 55%, transparent 92%)',
    }}>
      {!loaded && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(99,102,241,0.18) 0%, rgba(139,92,246,0.08) 45%, transparent 70%)',
        }} />
      )}

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
// Spline hero on load → press & hold triggers the Spline scene's own white
// animation → after hold completes, HeroDashboard slides up with all marketing.
export default function Landing() {
  const location = useLocation()

  const { isHolding, activated, startHold, cancelHold, reset } =
    useHoldActivation({ duration: 2400 })

  const [hashActivated, setHashActivated] = useState(!!location.hash)

  useEffect(() => {
    if (location.hash) setHashActivated(true)
  }, [location.hash])

  const handleDashboardClose = () => {
    reset()
    setHashActivated(false)
    if (window.location.hash)
      window.history.replaceState(null, '', window.location.pathname)
  }

  const handleHashNav = useCallback((hash) => {
    const id = hash.replace('#', '')
    const existing = document.getElementById(id)
    if (existing) { existing.scrollIntoView({ behavior: 'smooth', block: 'start' }); return }

    setHashActivated(true)
    window.history.replaceState(null, '', '/' + hash)
    const poll = (n = 0) => {
      const el = document.getElementById(id)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      else if (n < 30) setTimeout(() => poll(n + 1), 120)
    }
    setTimeout(() => poll(), 150)
  }, [])

  // Capture-phase hold listeners on the hero section
  const startRef     = useRef(startHold)
  const cancelRef    = useRef(cancelHold)
  const dashOpenRef  = useRef(false)
  startRef.current   = startHold
  cancelRef.current  = cancelHold
  const heroRef = useRef(null)

  const showDashboard = activated || hashActivated
  dashOpenRef.current = showDashboard

  useEffect(() => {
    const el = heroRef.current
    if (!el) return
    const down = (e) => {
      if (dashOpenRef.current) return
      import('./LandingReveal').catch(() => {})
      import('./Home').catch(() => {})
      import('../components/LearnLayout').catch(() => {})
      startRef.current?.()
    }
    const up = () => {
      if (dashOpenRef.current) return
      cancelRef.current?.()
    }
    el.addEventListener('pointerdown',  down, true)
    el.addEventListener('pointerup',    up,   true)
    el.addEventListener('pointerleave', up,   false)
    return () => {
      el.removeEventListener('pointerdown',  down, true)
      el.removeEventListener('pointerup',    up,   true)
      el.removeEventListener('pointerleave', up,   false)
    }
  }, [])

  return (
    <div style={{ background: '#060614', height: '100dvh', overflow: 'hidden' }}>

      {!showDashboard && <LandingHeader onHashNav={handleHashNav} />}

      <section
        ref={heroRef}
        style={{
          position: 'relative',
          width: '100%',
          height: '100dvh',
          maxHeight: '100dvh',
          minHeight: 500,
          overflow: 'hidden',
          background: '#060614',
          isolation: 'isolate',
          cursor: showDashboard ? 'default' : 'grab',
          userSelect: 'none',
        }}
      >
        <SplineHero />

        {/* Edge vignette — subtle framing, scene stays dominant */}
        <div aria-hidden="true" style={{
          position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none',
          boxShadow: 'inset 0 0 100px 30px rgba(6,6,20,0.5), inset 0 -60px 80px -20px rgba(6,6,20,0.6)',
        }} />

        {/* Soft bottom fade — just enough contrast for the hold cue */}
        <div aria-hidden="true" style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 4,
          height: '28%', pointerEvents: 'none',
          background: 'linear-gradient(to top, rgba(6,6,20,0.85) 0%, rgba(6,6,20,0.4) 40%, transparent 100%)',
        }} />

        {/* Scrim when dashboard is active */}
        {showDashboard && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 8,
            background: 'rgba(6,6,20,0.65)',
            backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
            pointerEvents: 'none', transition: 'opacity 0.4s ease',
          }} />
        )}

        {/* Hold cue — small, subtle prompt at bottom centre */}
        {!showDashboard && (
          <div style={{
            position: 'absolute', bottom: 36, left: '50%',
            transform: 'translateX(-50%)', zIndex: 7,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            pointerEvents: 'none', textAlign: 'center',
            opacity: isHolding ? 0.2 : 1,
            transition: 'opacity 0.3s ease',
          }}>
            <span style={{
              fontSize: 11, fontWeight: 600,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.45)',
              textShadow: '0 1px 12px rgba(6,6,20,0.8)',
            }}>
              Press &amp; hold anywhere to explore
            </span>
            <svg width={14} height={14} viewBox="0 0 14 14" fill="none"
              style={{ animation: 'hold-bob 2.2s ease-in-out infinite' }}>
              <path d="M7 1v12M3 9l4 4 4-4"
                stroke="rgba(255,255,255,0.35)" strokeWidth={1.4}
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}

        {/* Marketing overlay — slides up after hold completes */}
        <AnimatePresence>
          {showDashboard && (
            <HeroDashboard
              key="hero-dashboard"
              onClose={handleDashboardClose}
              skipAnimation={hashActivated && !activated}
            />
          )}
        </AnimatePresence>

        <style>{`
          @keyframes hold-bob {
            0%,100% { transform: translateY(0); opacity: 0.35; }
            50%     { transform: translateY(5px); opacity: 0.6; }
          }
        `}</style>
      </section>
    </div>
  )
}
