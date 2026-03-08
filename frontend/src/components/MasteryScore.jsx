import { useState, useEffect } from 'react'

const tierConfig = (pct) => {
  if (pct >= 80) return { color: 'var(--accent-success, #34d399)', label: 'Mastered', bg: 'rgba(52,211,153,0.08)' }
  if (pct >= 50) return { color: 'var(--accent-warning, #fbbf24)', label: 'Good progress', bg: 'rgba(251,191,36,0.08)' }
  if (pct > 0)   return { color: '#818cf8', label: 'Getting started', bg: 'rgba(129,140,248,0.08)' }
  return { color: 'var(--border-medium, #4b5563)', label: 'Not attempted', bg: 'transparent' }
}

export default function MasteryScore({ label = 'Mastery', percent = 0, delta, size = 'normal' }) {
  const [animated, setAnimated] = useState(0)
  const tier = tierConfig(percent)
  const isLarge = size === 'large'

  useEffect(() => {
    const timeout = setTimeout(() => setAnimated(percent), 80)
    return () => clearTimeout(timeout)
  }, [percent])

  const ringSize = isLarge ? 120 : 90
  const strokeWidth = isLarge ? 8 : 6
  const r = (ringSize - strokeWidth * 2) / 2
  const circ = 2 * Math.PI * r
  const fontSize = isLarge ? 22 : 16

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: isLarge ? 24 : 18,
      padding: isLarge ? '24px 28px' : '16px 20px',
      borderRadius: 16,
      background: tier.bg,
      border: `1px solid ${tier.color}25`,
    }}>
      <svg width={ringSize} height={ringSize} style={{ flexShrink: 0 }}>
        <circle
          cx={ringSize / 2} cy={ringSize / 2} r={r}
          fill="none" stroke="var(--border-light, rgba(255,255,255,0.08))" strokeWidth={strokeWidth}
        />
        <circle
          cx={ringSize / 2} cy={ringSize / 2} r={r}
          fill="none" stroke={tier.color} strokeWidth={strokeWidth}
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - Math.min(animated, 100) / 100)}
          strokeLinecap="round"
          transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
          style={{
            transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)',
            filter: `drop-shadow(0 0 6px ${tier.color}50)`,
          }}
        />
        <text
          x={ringSize / 2} y={ringSize / 2 + fontSize / 3}
          textAnchor="middle"
          fontSize={fontSize} fontWeight="800"
          fill={percent > 0 ? tier.color : 'var(--primary-text-muted, #6b7280)'}
          fontFamily="var(--font-display)"
        >
          {percent > 0 ? `${percent}%` : '—'}
        </text>
      </svg>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{
            fontSize: isLarge ? 15 : 13, fontWeight: 700,
            color: 'var(--primary-text)', textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}>
            {label}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700, color: tier.color,
            background: `${tier.color}18`, border: `1px solid ${tier.color}30`,
            padding: '1px 8px', borderRadius: 20,
          }}>
            {tier.label}
          </span>
        </div>

        {/* Progress bar */}
        <div style={{
          height: isLarge ? 8 : 6, borderRadius: 99,
          background: 'var(--border-light, rgba(255,255,255,0.08))',
          overflow: 'hidden', marginBottom: delta != null ? 8 : 0,
        }}>
          <div style={{
            height: '100%', borderRadius: 99,
            width: `${Math.min(animated, 100)}%`,
            background: `linear-gradient(90deg, ${tier.color}, ${tier.color}cc)`,
            transition: 'width 1.2s cubic-bezier(0.4,0,0.2,1)',
          }} />
        </div>

        {delta != null && delta !== 0 && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 12, fontWeight: 700,
            color: delta > 0 ? 'var(--accent-success, #34d399)' : 'var(--accent-error, #ef4444)',
          }}>
            <span>{delta > 0 ? '▲' : '▼'}</span>
            <span>{delta > 0 ? '+' : ''}{delta}% from last session</span>
          </div>
        )}
      </div>
    </div>
  )
}
