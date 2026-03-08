const SIZES = {
  default: { box: 48, icon: 24, ring: 48 },
  small:   { box: 36, icon: 18, ring: 36 },
  large:   { box: 64, icon: 32, ring: 64 },
}

const TOPIC_PATHS = {
  motion: (s, g) => (
    <>
      <path d={`M${s*0.2} ${s*0.75} Q${s*0.5} ${s*0.1} ${s*0.8} ${s*0.3}`}
        fill="none" stroke={g} strokeWidth={s*0.09} strokeLinecap="round" />
      <polygon points={`${s*0.75},${s*0.18} ${s*0.83},${s*0.32} ${s*0.68},${s*0.34}`}
        fill={g} />
      <path d={`M${s*0.2} ${s*0.75} Q${s*0.35} ${s*0.55} ${s*0.5} ${s*0.55}`}
        fill="none" stroke={g} strokeWidth={s*0.04} strokeDasharray={`${s*0.06} ${s*0.04}`} strokeLinecap="round" opacity={0.4} />
    </>
  ),

  forces: (s, g) => (
    <>
      <line x1={s*0.12} y1={s*0.5} x2={s*0.42} y2={s*0.5}
        stroke={g} strokeWidth={s*0.07} strokeLinecap="round" />
      <polygon points={`${s*0.40},${s*0.38} ${s*0.50},${s*0.5} ${s*0.40},${s*0.62}`}
        fill={g} />
      <line x1={s*0.88} y1={s*0.5} x2={s*0.58} y2={s*0.5}
        stroke={g} strokeWidth={s*0.07} strokeLinecap="round" />
      <polygon points={`${s*0.60},${s*0.38} ${s*0.50},${s*0.5} ${s*0.60},${s*0.62}`}
        fill={g} />
    </>
  ),

  energy: (s, g) => (
    <>
      <polygon
        points={`${s*0.55},${s*0.1} ${s*0.35},${s*0.46} ${s*0.50},${s*0.46} ${s*0.42},${s*0.9} ${s*0.68},${s*0.46} ${s*0.52},${s*0.46} ${s*0.62},${s*0.1}`}
        fill={g} />
    </>
  ),

  waves: (s, g) => (
    <>
      <path d={`M${s*0.08} ${s*0.5} C${s*0.22} ${s*0.12},${s*0.34} ${s*0.12},${s*0.5} ${s*0.5} S${s*0.66} ${s*0.88},${s*0.76} ${s*0.5} S${s*0.88} ${s*0.12},${s*0.92} ${s*0.5}`}
        fill="none" stroke={g} strokeWidth={s*0.08} strokeLinecap="round" />
    </>
  ),

  light: (s, g) => {
    const cx = s * 0.5, cy = s * 0.5, r = s * 0.13
    return (
      <>
        <circle cx={cx} cy={cy} r={r} fill={g} opacity={0.9} />
        {[0, 45, 90, 135, 180, 225, 270, 315].map(a => {
          const rad = a * Math.PI / 180
          const x1 = cx + (r + s * 0.05) * Math.cos(rad)
          const y1 = cy + (r + s * 0.05) * Math.sin(rad)
          const x2 = cx + (r + s * 0.17) * Math.cos(rad)
          const y2 = cy + (r + s * 0.17) * Math.sin(rad)
          return <line key={a} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={g} strokeWidth={s * 0.04} strokeLinecap="round" opacity={a % 90 === 0 ? 0.9 : 0.5} />
        })}
      </>
    )
  },

  electricity: (s, g) => (
    <>
      <rect x={s*0.2} y={s*0.22} width={s*0.6} height={s*0.52} rx={s*0.08}
        fill="none" stroke={g} strokeWidth={s*0.05} />
      <line x1={s*0.44} y1={s*0.22} x2={s*0.44} y2={s*0.12}
        stroke={g} strokeWidth={s*0.05} strokeLinecap="round" />
      <line x1={s*0.56} y1={s*0.22} x2={s*0.56} y2={s*0.16}
        stroke={g} strokeWidth={s*0.05} strokeLinecap="round" />
      <polyline
        points={`${s*0.30},${s*0.74} ${s*0.36},${s*0.62} ${s*0.42},${s*0.84} ${s*0.48},${s*0.62} ${s*0.54},${s*0.84} ${s*0.60},${s*0.62} ${s*0.68},${s*0.74}`}
        fill="none" stroke={g} strokeWidth={s*0.045} strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),

  magnetism: (s, g) => (
    <>
      <path d={`M${s*0.25} ${s*0.72} L${s*0.25} ${s*0.4} A${s*0.25} ${s*0.25} 0 0 1 ${s*0.75} ${s*0.4} L${s*0.75} ${s*0.72}`}
        fill="none" stroke={g} strokeWidth={s*0.08} strokeLinecap="round" />
      <text x={s*0.25} y={s*0.88} textAnchor="middle" fontSize={s*0.15} fontWeight="800" fill="#ef4444" fontFamily="var(--font-display)">N</text>
      <text x={s*0.75} y={s*0.88} textAnchor="middle" fontSize={s*0.15} fontWeight="800" fill="#818cf8" fontFamily="var(--font-display)">S</text>
      <path d={`M${s*0.35} ${s*0.32} Q${s*0.5} ${s*0.05} ${s*0.65} ${s*0.32}`}
        fill="none" stroke={g} strokeWidth={s*0.025} strokeDasharray={`${s*0.04} ${s*0.03}`} opacity={0.45} />
    </>
  ),

  heat: (s, g) => (
    <>
      <rect x={s*0.42} y={s*0.12} width={s*0.16} height={s*0.48} rx={s*0.08}
        fill="none" stroke={g} strokeWidth={s*0.05} />
      <circle cx={s*0.5} cy={s*0.72} r={s*0.15} fill={g} opacity={0.85} />
      <rect x={s*0.46} y={s*0.32} width={s*0.08} height={s*0.3} rx={s*0.04}
        fill={g} opacity={0.65} />
      {[0.22, 0.36, 0.50].map((yOff, i) => (
        <path key={i} d={`M${s*0.66} ${s*yOff} Q${s*0.74} ${s*(yOff-0.06)} ${s*0.72} ${s*(yOff-0.12)}`}
          fill="none" stroke={g} strokeWidth={s*0.03} strokeLinecap="round" opacity={0.35 + i*0.15} />
      ))}
    </>
  ),

  gravity: (s, g) => (
    <>
      <circle cx={s*0.5} cy={s*0.5} r={s*0.18} fill={g} opacity={0.75} />
      <ellipse cx={s*0.5} cy={s*0.5} rx={s*0.38} ry={s*0.14}
        fill="none" stroke={g} strokeWidth={s*0.035} opacity={0.45}
        transform={`rotate(-20 ${s*0.5} ${s*0.5})`} />
      <circle cx={s*0.85} cy={s*0.38} r={s*0.05} fill={g} />
    </>
  ),

  quantum: (s, g) => {
    const cx = s * 0.5, cy = s * 0.5
    return (
      <>
        <circle cx={cx} cy={cy} r={s*0.09} fill={g} />
        {[0, 60, 120].map(a => (
          <ellipse key={a} cx={cx} cy={cy} rx={s*0.38} ry={s*0.12}
            fill="none" stroke={g} strokeWidth={s*0.03} opacity={0.5}
            transform={`rotate(${a} ${cx} ${cy})`} />
        ))}
        {[
          [cx + s*0.34, cy - s*0.06],
          [cx - s*0.20, cy + s*0.28],
          [cx - s*0.16, cy - s*0.27],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={s*0.04} fill={g} />
        ))}
      </>
    )
  },
}

let _uid = 0

export default function TopicIcon({ topicId, size = 'default' }) {
  const s = SIZES[size] || SIZES.default
  const renderIcon = TOPIC_PATHS[topicId]
  if (!renderIcon) return null

  const gradId = `tig-${topicId}-${size}-${++_uid}`
  const gRef = `url(#${gradId})`

  return (
    <div style={{
      width: s.ring, height: s.ring, borderRadius: '50%', flexShrink: 0,
      background: 'rgba(99,102,241,0.08)',
      border: '1.5px solid rgba(99,102,241,0.22)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} aria-hidden>
      <svg width={s.icon} height={s.icon} viewBox={`0 0 ${s.icon} ${s.icon}`} fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#818cf8" />
            <stop offset="50%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#a78bfa" />
          </linearGradient>
        </defs>
        {renderIcon(s.icon, gRef)}
      </svg>
    </div>
  )
}
