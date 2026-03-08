/**
 * HeroDashboard
 *
 * After the 800ms hold completes this page slides up from the bottom,
 * covering the entire viewport (position: fixed; inset: 0; z-index: 300).
 *
 * Layout:
 *   1. Sticky top bar  — Byte Wave wordmark + "Back to hero" pill
 *   2. Hero intro      — tagline + scroll cue so the user knows they're in a new page
 *   3. LandingReveal   — full marketing story (Problem/Solution, Stats, Live Demo,
 *                        How It Works, Pricing, Waitlist)
 *   4. Bottom CTA      — "Start learning for free →" → /learn
 *
 * The Home (study dashboard) is NOT shown here — that lives at /learn.
 */

import { lazy, Suspense, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Link, useNavigate } from 'react-router-dom'
import WaveMark from './WaveMark'

const MarketingContent = lazy(() => import('../screens/LandingReveal'))

const EASE = [0.22, 1, 0.36, 1]

const preloadLearnChunks = () => {
  import('../screens/Home').catch(() => {})
  import('./LearnLayout').catch(() => {})
}

export default function HeroDashboard({ onClose, skipAnimation = false }) {
  const navigate    = useNavigate()
  const scrollRef   = useRef(null)

  useEffect(() => { preloadLearnChunks() }, [])

  const scrollDown = () => {
    scrollRef.current?.scrollBy({ top: window.innerHeight * 0.85, behavior: 'smooth' })
  }

  return (
    <motion.div
      ref={scrollRef}
      initial={skipAnimation ? { y: 0, opacity: 1 } : { y: '100vh', opacity: 0 }}
      animate={{ y: 0,       opacity: 1 }}
      exit={{    y: '100vh', opacity: 0 }}
      transition={skipAnimation ? { duration: 0 } : { type: 'spring', damping: 30, stiffness: 220 }}
      style={{
        position:   'fixed',
        inset:      0,
        zIndex:     300,
        overflowY:  'auto',
        overflowX:  'hidden',
        background: 'var(--primary-bg)',
        WebkitOverflowScrolling: 'touch',
      }}
    >

      {/* ── 1. Sticky top bar ── */}
      <div style={{
        position:        'sticky',
        top:             0,
        zIndex:          10,
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'space-between',
        padding:         '0 28px',
        height:          58,
        background:      'rgba(6,6,20,0.75)',
        backdropFilter:  'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        borderBottom:    '1px solid rgba(129,140,248,0.15)',
      }}>
        {/* Wordmark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <WaveMark />
          <span style={{
            fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700,
            color: '#fff', letterSpacing: '-0.02em',
          }}>
            Byte Wave
          </span>
        </div>

        {/* Right: CTA + close */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => navigate('/auth')}
            onMouseEnter={preloadLearnChunks}
            style={{
              padding:      '7px 18px',
              borderRadius: 8,
              background:   'linear-gradient(135deg, #6366f1, #8b5cf6)',
              border:       'none',
              color:        '#fff',
              fontSize:     13,
              fontWeight:   700,
              cursor:       'pointer',
              boxShadow:    '0 2px 12px rgba(99,102,241,0.45)',
              letterSpacing: '0.01em',
            }}
          >
            Sign Up →
          </button>

          {onClose && (
            <button
              onClick={onClose}
              aria-label="Back to hero"
              style={{
                display:         'flex',
                alignItems:      'center',
                gap:             6,
                padding:         '7px 16px',
                borderRadius:    100,
                background:      'rgba(255,255,255,0.07)',
                border:          '1px solid rgba(129,140,248,0.25)',
                color:           'rgba(255,255,255,0.65)',
                fontSize:        12,
                fontWeight:      700,
                cursor:          'pointer',
                letterSpacing:   '0.06em',
                transition:      'background 0.15s, color 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.13)'
                e.currentTarget.style.color      = '#fff'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.07)'
                e.currentTarget.style.color      = 'rgba(255,255,255,0.65)'
              }}
            >
              <svg width={10} height={10} viewBox="0 0 10 10" fill="none">
                <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round"/>
              </svg>
              CLOSE
            </button>
          )}
        </div>
      </div>

      {/* ── 2. Hero intro block ── */}
      <div style={{
        minHeight:    '40vh',
        display:      'flex',
        flexDirection: 'column',
        alignItems:   'center',
        justifyContent: 'center',
        textAlign:    'center',
        padding:      '64px 24px 48px',
        background:   'linear-gradient(180deg, rgba(6,6,20,0.95) 0%, var(--primary-bg) 100%)',
        position:     'relative',
        overflow:     'hidden',
      }}>
        {/* Subtle radial glow */}
        <div style={{
          position:     'absolute',
          top:          '50%',
          left:         '50%',
          transform:    'translate(-50%, -60%)',
          width:        700,
          height:       700,
          borderRadius: '50%',
          background:   'radial-gradient(circle, rgba(99,102,241,0.14) 0%, rgba(139,92,246,0.06) 40%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Label pill */}
        <div style={{
          display:       'inline-flex',
          alignItems:    'center',
          gap:           8,
          padding:       '5px 14px',
          borderRadius:  100,
          background:    'rgba(99,102,241,0.12)',
          border:        '1px solid rgba(99,102,241,0.28)',
          marginBottom:  22,
          position:      'relative',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: '#818cf8', display: 'inline-block',
            animation: 'hd-pulse 2s ease-in-out infinite',
          }} />
          <span style={{
            fontSize: 10, fontWeight: 800, color: '#818cf8',
            letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>
            What is Byte Wave?
          </span>
        </div>

        <h1 style={{
          fontFamily:   'var(--font-display)',
          fontSize:     'clamp(28px, 5vw, 54px)',
          fontWeight:   800,
          lineHeight:   1.08,
          color:        '#fff',
          margin:       '0 0 18px',
          letterSpacing: '-0.03em',
          maxWidth:     680,
          position:     'relative',
        }}>
          Master physics visually.{' '}
          <span style={{
            background: 'linear-gradient(135deg, #818cf8, #a78bfa)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>AI finds every gap.</span>
        </h1>

        <p style={{
          fontSize:    'clamp(14px, 1.5vw, 17px)',
          lineHeight:  1.65,
          color:       'rgba(255,255,255,0.55)',
          maxWidth:    480,
          margin:      '0 0 36px',
          position:    'relative',
        }}>
          Scroll through to see how it works — real cases, instant AI feedback, and visual animations.
        </p>

        {/* Scroll cue */}
        <button
          onClick={scrollDown}
          style={{
            background:  'none',
            border:      '1px solid rgba(129,140,248,0.3)',
            borderRadius: 100,
            padding:     '10px 20px',
            color:       'rgba(129,140,248,0.7)',
            fontSize:    11,
            fontWeight:  700,
            letterSpacing: '0.09em',
            textTransform: 'uppercase',
            cursor:      'pointer',
            display:     'flex',
            alignItems:  'center',
            gap:         8,
            position:    'relative',
            transition:  'border-color 0.15s, color 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'rgba(129,140,248,0.6)'
            e.currentTarget.style.color       = '#818cf8'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'rgba(129,140,248,0.3)'
            e.currentTarget.style.color       = 'rgba(129,140,248,0.7)'
          }}
        >
          Explore
          <svg width={12} height={12} viewBox="0 0 12 12" fill="none">
            <path d="M6 1v10M2 7l4 4 4-4"
              stroke="currentColor" strokeWidth={1.4}
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* ── 3. Full marketing story ── */}
      <Suspense fallback={
        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            border: '3px solid rgba(99,102,241,0.2)',
            borderTopColor: '#6366f1',
            animation: 'hd-spin 0.7s linear infinite',
          }} />
        </div>
      }>
        <MarketingContent />
      </Suspense>

      {/* ── 4. Bottom CTA ── */}
      <div style={{
        padding:      '80px 24px 100px',
        textAlign:    'center',
        background:   'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.05) 100%)',
        borderTop:    '1px solid rgba(99,102,241,0.18)',
        position:     'relative',
        overflow:     'hidden',
      }}>
        {/* Background glow */}
        <div style={{
          position:     'absolute',
          top:          '50%',
          left:         '50%',
          transform:    'translate(-50%, -50%)',
          width:        600,
          height:       600,
          borderRadius: '50%',
          background:   'radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 65%)',
          pointerEvents: 'none',
        }} />

        {/* Content */}
        <div style={{ position: 'relative' }}>
          <div style={{
            display:      'inline-flex',
            alignItems:   'center',
            gap:          8,
            padding:      '5px 14px',
            borderRadius: 100,
            background:   'rgba(99,102,241,0.1)',
            border:       '1px solid rgba(99,102,241,0.25)',
            marginBottom: 24,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', display: 'inline-block', animation: 'hd-pulse 2s ease-in-out infinite' }} />
            <span style={{ fontSize: 10, fontWeight: 800, color: '#34d399', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Ready to start?
            </span>
          </div>

          <h2 style={{
            fontFamily:   'var(--font-display)',
            fontSize:     'clamp(26px, 4vw, 44px)',
            fontWeight:   800,
            margin:       '0 0 14px',
            color:        'var(--primary-text)',
            letterSpacing: '-0.02em',
            lineHeight:   1.1,
          }}>
            Find your first physics gap<br />in under 60 seconds.
          </h2>

          <p style={{
            fontSize:    15,
            lineHeight:  1.65,
            color:       'var(--primary-text-muted)',
            maxWidth:    420,
            margin:      '0 auto 36px',
          }}>
            Answer one case. The AI diagnoses exactly what you need to review.
            No sign-up required to try.
          </p>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => navigate('/auth')}
              style={{
                padding:      '15px 36px',
                borderRadius: 12,
                background:   'linear-gradient(135deg, #6366f1, #8b5cf6)',
                border:       'none',
                color:        '#fff',
                fontSize:     16,
                fontWeight:   700,
                cursor:       'pointer',
                boxShadow:    '0 6px 28px rgba(99,102,241,0.45)',
                letterSpacing: '0.01em',
                transition:   'transform 0.15s, box-shadow 0.15s',
              }}
              onMouseEnter={e => {
                preloadLearnChunks()
                e.currentTarget.style.transform  = 'translateY(-2px)'
                e.currentTarget.style.boxShadow  = '0 10px 36px rgba(99,102,241,0.55)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform  = 'none'
                e.currentTarget.style.boxShadow  = '0 6px 28px rgba(99,102,241,0.45)'
              }}
            >
              Sign up free →
            </button>

            {onClose && (
              <button
                onClick={onClose}
                style={{
                  padding:      '15px 28px',
                  borderRadius: 12,
                  background:   'transparent',
                  border:       '1.5px solid var(--border-medium)',
                  color:        'var(--primary-text-muted)',
                  fontSize:     15,
                  fontWeight:   600,
                  cursor:       'pointer',
                  transition:   'border-color 0.15s, color 0.15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'rgba(129,140,248,0.5)'
                  e.currentTarget.style.color       = 'var(--primary-text)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--border-medium)'
                  e.currentTarget.style.color       = 'var(--primary-text-muted)'
                }}
              >
                ← Back to hero
              </button>
            )}
          </div>

          <p style={{ marginTop: 20, fontSize: 12, color: 'var(--primary-text-muted)' }}>
            No credit card · No account needed to try · Free forever plan
          </p>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer style={{
        borderTop: '1px solid rgba(255,255,255,0.08)',
        padding: '40px 32px 48px',
        background: 'rgba(6,6,20,0.6)',
      }}>
        <div style={{
          maxWidth: 1100, margin: '0 auto',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 24,
        }}>
          {/* Left: logo + tagline */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <WaveMark />
            <div>
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700,
                color: '#fff', letterSpacing: '-0.02em',
              }}>Byte Wave</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                AI-powered physics for high school students
              </div>
            </div>
          </div>

          {/* Right: nav links */}
          <nav style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            {[
              { label: 'AI Chat',   to: '/chat'            },
              { label: 'Community', to: '/forum'           },
              { label: 'Skill map', to: '/learn/skill-map' },
            ].map(({ label, to }) => (
              <Link key={label} to={to} style={{
                padding: '6px 12px', borderRadius: 8,
                fontSize: 13, fontWeight: 600,
                color: 'rgba(255,255,255,0.45)', textDecoration: 'none',
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = '#fff' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.45)' }}
              >{label}</Link>
            ))}
          </nav>
        </div>
        <div style={{
          maxWidth: 1100, margin: '20px auto 0',
          paddingTop: 20,
          borderTop: '1px solid rgba(255,255,255,0.06)',
          fontSize: 12, color: 'rgba(255,255,255,0.3)',
          textAlign: 'center',
        }}>
          © 2026 Byte Wave · Built for high school physics students
        </div>
      </footer>

      {/* Keyframe animations + LandingReveal responsive overrides */}
      <style>{`
        @keyframes hd-pulse {
          0%,100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.4; transform: scale(0.7); }
        }
        @keyframes hd-spin {
          to { transform: rotate(360deg); }
        }
        @media (max-width: 768px) {
          .prob-sol-grid   { grid-template-columns: 1fr !important; }
          .prob-sol-grid > div { border-right: none !important; padding: 28px 0 !important; border-bottom: 1px solid rgba(255,255,255,0.08); }
          .prob-sol-grid > div:last-child { border-bottom: none; }
          .diff-grid       { grid-template-columns: 1fr !important; }
          .stats-grid      { grid-template-columns: 1fr 1fr !important; }
          .preview-grid    { grid-template-columns: 1fr !important; }
          .pricing-grid    { grid-template-columns: 1fr !important; }
          .team-grid       { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </motion.div>
  )
}
