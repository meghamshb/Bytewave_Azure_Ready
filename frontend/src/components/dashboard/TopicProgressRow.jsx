import { useState } from 'react'

export default function TopicProgressRow({ name, mastery, status, onClick }) {
  const [hover, setHover] = useState(false)
  const color = status === 'Mastered' ? 'var(--accent-success)' : status === 'In progress' ? 'var(--accent-warning)' : 'var(--border-medium)'

  return (
    <button
      type="button" onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
        borderRadius: 10, background: hover ? 'rgba(99,102,241,0.06)' : 'none',
        border: 'none', cursor: 'pointer',
        width: '100%', textAlign: 'left',
        transition: 'background 0.15s',
      }}
    >
      <div style={{
        width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0,
        boxShadow: status !== 'Not started' ? `0 0 6px ${color}` : 'none',
      }} />
      <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--primary-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {name}
      </span>
      <div style={{ width: 60, height: 4, borderRadius: 99, background: 'var(--border-light)', overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ height: '100%', width: `${mastery}%`, background: color, borderRadius: 99, transition: 'width 1s ease' }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary-text-muted)', width: 28, textAlign: 'right', flexShrink: 0 }}>
        {mastery}%
      </span>
    </button>
  )
}
