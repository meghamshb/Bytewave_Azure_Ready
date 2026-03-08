import { useState, useRef, useCallback } from 'react'

/**
 * MediaPreviewCard — reusable premium media display for landing demos.
 *
 * Supports: video src, poster image, or a demo-ready placeholder state.
 * Responsive, with loading skeleton and polished browser-chrome wrapper.
 *
 * Props:
 *   src        — video URL (optional; shows placeholder if absent)
 *   poster     — poster/thumbnail URL (optional)
 *   title      — media title shown below the frame
 *   caption    — short caption below title
 *   aspectRatio — CSS aspect-ratio (default '16/9')
 */
export default function MediaPreviewCard({
  src = null,
  poster = null,
  title = 'AI-generated animation',
  caption = 'Watch how Byte Wave turns abstract physics into visual clarity.',
  aspectRatio = '16/9',
}) {
  const [loaded, setLoaded]   = useState(false)
  const [playing, setPlaying] = useState(false)
  const [hovered, setHovered] = useState(false)
  const videoRef = useRef(null)

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) { v.play(); setPlaying(true) }
    else          { v.pause(); setPlaying(false) }
  }, [])

  return (
    <div style={{ maxWidth: 740, margin: '0 auto' }}>
      {/* Browser chrome wrapper */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-light)',
          borderRadius: 20,
          overflow: 'hidden',
          boxShadow: hovered
            ? '0 24px 80px rgba(0,0,0,0.22), 0 0 0 1px rgba(99,102,241,0.12)'
            : '0 16px 60px rgba(0,0,0,0.15)',
          transition: 'box-shadow 0.3s ease, transform 0.3s ease',
          transform: hovered ? 'translateY(-2px)' : 'none',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Top bar — browser dots */}
        <div style={{
          background: 'var(--primary-bg)',
          borderBottom: '1px solid var(--border-light)',
          padding: '10px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {['#ef4444', '#f59e0b', '#22c55e'].map(c => (
              <div key={c} style={{
                width: 10, height: 10, borderRadius: '50%',
                background: c, opacity: 0.8,
              }} />
            ))}
          </div>
          <div style={{
            flex: 1,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-light)',
            borderRadius: 6,
            padding: '4px 12px',
            fontSize: 11,
            color: 'var(--primary-text-muted)',
            maxWidth: 280,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <rect x={3} y={3} width={18} height={18} rx={2} />
              <path d="M10 8l6 4-6 4V8z" fill="currentColor" stroke="none"/>
            </svg>
            bytewave.app/animation
          </div>
        </div>

        {/* Media viewport */}
        <div style={{
          position: 'relative',
          aspectRatio,
          background: '#0a0a1a',
          overflow: 'hidden',
        }}>
          {src ? (
            <>
              {/* Loading skeleton */}
              {!loaded && (
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.04) 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    border: '3px solid rgba(99,102,241,0.2)',
                    borderTopColor: '#6366f1',
                    animation: 'mpc-spin 0.7s linear infinite',
                  }} />
                </div>
              )}

              <video
                ref={videoRef}
                src={src}
                poster={poster || undefined}
                onLoadedData={() => setLoaded(true)}
                onClick={togglePlay}
                playsInline
                style={{
                  width: '100%', height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                  cursor: 'pointer',
                  opacity: loaded ? 1 : 0,
                  transition: 'opacity 0.4s ease',
                }}
              />

              {/* Play/pause overlay */}
              {loaded && !playing && (
                <button
                  onClick={togglePlay}
                  style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.3)',
                    border: 'none', cursor: 'pointer',
                    transition: 'background 0.2s',
                  }}
                >
                  <div style={{
                    width: 64, height: 64, borderRadius: '50%',
                    background: 'rgba(99,102,241,0.9)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 8px 32px rgba(99,102,241,0.4)',
                  }}>
                    <svg width={24} height={24} viewBox="0 0 24 24" fill="#fff">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  </div>
                </button>
              )}
            </>
          ) : (
            /* Placeholder when no video src — demo-ready state */
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(135deg, #0c0c24, #12122a)',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 16,
            }}>
              {/* Animated physics formulae background */}
              {['F = ma', 'v = u + at', 'E = ½mv²', 'p = mv', 's = ut + ½at²'].map((f, i) => (
                <span key={f} style={{
                  position: 'absolute',
                  left: `${8 + i * 18}%`,
                  top: `${15 + (i % 3) * 28}%`,
                  color: 'rgba(129,140,248,0.12)',
                  fontFamily: 'monospace',
                  fontSize: 13,
                  fontWeight: 600,
                  animation: `mpc-float ${10 + i * 1.5}s ${i * 0.8}s ease-in-out infinite`,
                  pointerEvents: 'none',
                }}>{f}</span>
              ))}

              {/* Center icon */}
              <div style={{
                width: 72, height: 72, borderRadius: 20,
                background: 'rgba(99,102,241,0.12)',
                border: '1px solid rgba(99,102,241,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="rgba(129,140,248,0.7)" strokeWidth={1.5}>
                  <rect x={2} y={4} width={20} height={16} rx={3}/>
                  <path d="M10 9l5 3-5 3V9z" fill="rgba(129,140,248,0.5)" stroke="none"/>
                </svg>
              </div>
              <span style={{
                fontSize: 13, fontWeight: 600,
                color: 'rgba(129,140,248,0.5)',
                letterSpacing: '0.04em',
              }}>
                Animation preview coming soon
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Caption below */}
      {(title || caption) && (
        <div style={{ textAlign: 'center', marginTop: 16, padding: '0 16px' }}>
          {title && (
            <div style={{
              fontSize: 14, fontWeight: 700,
              color: 'var(--primary-text)',
              marginBottom: 4,
            }}>{title}</div>
          )}
          {caption && (
            <p style={{
              fontSize: 12, color: 'var(--primary-text-muted)',
              fontStyle: 'italic', margin: 0,
            }}>{caption}</p>
          )}
        </div>
      )}

      <style>{`
        @keyframes mpc-spin { to { transform: rotate(360deg); } }
        @keyframes mpc-float {
          0%, 100% { transform: translateY(0); opacity: 0.12; }
          50% { transform: translateY(-8px); opacity: 0.2; }
        }
      `}</style>
    </div>
  )
}
