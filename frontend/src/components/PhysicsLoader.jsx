import { useState, useEffect } from 'react'

const FORMULAS = [
  'F = ma',
  'E = mc²',
  'v = u + at',
  'PV = nRT',
  'λ = h/p',
  'E = hf',
  'W = Fd cosθ',
  'ΔU = Q − W',
]

export default function PhysicsLoader({ label = 'Loading…' }) {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setIdx(i => (i + 1) % FORMULAS.length), 2400)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 20, padding: 32,
    }}>
      {/* Orbit spinner */}
      <div style={{ position: 'relative', width: 72, height: 72 }}>
        <svg width={72} height={72} viewBox="0 0 72 72" fill="none" style={{ animation: 'bw-orbit-spin 3s linear infinite' }}>
          <circle cx={36} cy={36} r={28} stroke="rgba(99,102,241,0.12)" strokeWidth={2} />
          <circle cx={36} cy={8} r={5} fill="url(#bw-orb-grad)"
            style={{ filter: 'drop-shadow(0 0 8px rgba(129,140,248,0.7))' }} />
          <defs>
            <radialGradient id="bw-orb-grad" cx="40%" cy="40%">
              <stop offset="0%" stopColor="#c4b5fd" />
              <stop offset="100%" stopColor="#6366f1" />
            </radialGradient>
          </defs>
        </svg>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: 'rgba(129,140,248,0.6)',
            boxShadow: '0 0 12px rgba(99,102,241,0.4)',
          }} />
        </div>
      </div>

      {/* Rotating formula */}
      <div style={{
        fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700,
        color: 'rgba(129,140,248,0.7)', letterSpacing: '0.02em',
        minHeight: 22, transition: 'opacity 0.3s',
        animation: 'bw-formula-cycle 2.4s ease-in-out infinite',
      }}>
        {FORMULAS[idx]}
      </div>

      {/* Label with dot pulse */}
      {label && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {[0, 0.15, 0.3].map(d => (
            <div key={d} style={{
              width: 4, height: 4, borderRadius: '50%',
              background: 'var(--accent-main)',
              animation: `bw-dot-pulse 1.2s ${d}s ease-in-out infinite`,
            }} />
          ))}
          <span style={{
            fontFamily: 'var(--font-display)', fontSize: 13,
            fontWeight: 600, color: 'var(--primary-text-muted)',
            letterSpacing: '0.03em', marginLeft: 4,
          }}>
            {label}
          </span>
        </div>
      )}

      <style>{`
        @keyframes bw-orbit-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes bw-formula-cycle {
          0%, 100% { opacity: 0.3; transform: translateY(2px); }
          20%, 80% { opacity: 1;   transform: translateY(0); }
        }
        @keyframes bw-dot-pulse {
          0%,80%,100% { transform: scale(1);   opacity: 0.4; }
          40%          { transform: scale(1.6); opacity: 1;   }
        }
      `}</style>
    </div>
  )
}
