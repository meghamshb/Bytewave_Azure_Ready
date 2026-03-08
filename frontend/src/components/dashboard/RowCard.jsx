import { useState } from 'react'
import TopicIcon from '../TopicIcon'
import { IcoArrow } from './icons'

export default function RowCard({ title, reason, topicId, tag, tagColor, onClick }) {
  const [hover, setHover] = useState(false)

  return (
    <button
      type="button" onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
        borderRadius: 12, width: '100%', cursor: 'pointer', textAlign: 'left',
        background: hover ? 'var(--bg-card-hover)' : 'var(--bg-card)',
        border: '1px solid var(--border-light)',
        transition: 'background 0.15s',
      }}
    >
      <TopicIcon topicId={topicId} size="small" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: 'var(--primary-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</p>
        {reason && <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--primary-text-muted)' }}>{reason}</p>}
      </div>
      {tag && (
        <span style={{
          fontSize: 11, fontWeight: 700, color: tagColor,
          background: `${tagColor}15`, padding: '3px 9px', borderRadius: 20, flexShrink: 0,
          border: `1px solid ${tagColor}25`,
        }}>
          {tag}
        </span>
      )}
      <span style={{ color: 'var(--primary-text-muted)', flexShrink: 0 }}><IcoArrow /></span>
    </button>
  )
}
