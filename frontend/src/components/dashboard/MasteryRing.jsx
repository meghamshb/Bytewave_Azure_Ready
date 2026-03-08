export default function MasteryRing({ percent = 0, label = 'Overall', size = 100 }) {
  const r = (size - 10) / 2
  const circ = 2 * Math.PI * r
  const color = percent >= 80 ? 'var(--accent-success)' : percent >= 50 ? 'var(--accent-warning)' : '#818cf8'
  const tierLabel = percent === 0 ? 'Start a case!' : percent >= 80 ? 'Excellent' : percent >= 50 ? 'Good progress' : 'Keep going'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border-light)" strokeWidth={8} />
        {percent > 0 && (
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke={color} strokeWidth={8}
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - Math.min(percent, 100) / 100)}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)', filter: `drop-shadow(0 0 6px ${color}60)` }}
          />
        )}
        <text x={size / 2} y={size / 2 + (percent > 0 ? 2 : -2)} textAnchor="middle"
          fontSize={percent > 0 ? 22 : 14} fontWeight="800"
          fill={percent > 0 ? color : 'var(--primary-text-muted)'}
          fontFamily="var(--font-display)">
          {percent > 0 ? `${percent}%` : '—'}
        </text>
        {percent > 0 && (
          <text x={size / 2} y={size / 2 + 18} textAnchor="middle"
            fontSize={9} fontWeight="600"
            fill="var(--primary-text-muted)">
            {tierLabel}
          </text>
        )}
      </svg>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary-text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        {label}
      </span>
    </div>
  )
}
