import React, { memo } from 'react'
import TopicIcon from './TopicIcon'

const styles = {
  card: {
    background: 'var(--bg-card)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid var(--border-light)',
    borderLeft: '3px solid var(--graph-axis-thick)',
    borderBottom: '3px solid var(--graph-axis-thick)',
    borderRadius: '0 16px 0 0',
    padding: 24,
    paddingLeft: 22,
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.4s ease',
    boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
    position: 'relative',
  },
  cardHover: {
    transform: 'translateY(-4px)',
    boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
  },
  corner: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: 8,
    height: 8,
    background: 'var(--graph-axis-thick)',
    borderRadius: '0 2px 0 0',
  },
  iconWrap: { marginBottom: 14 },
  title: { margin: '0 0 6px', fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--primary-text)' },
  subtitle: { margin: 0, fontSize: 13, color: 'var(--primary-text-muted)', lineHeight: 1.5 },
  footer: { marginTop: 18, fontSize: 14, fontWeight: 600, color: 'var(--rec-high)' },
  match: { fontFamily: 'var(--font-readout)', fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--rec-high)', marginTop: 8 },
}

export default memo(function CaseCard({ title, subtitle, matchPercent, topicId, status, onClick }) {
  const [hover, setHover] = React.useState(false)

  const statusBadge = status === 'mastered'
    ? { label: '✓ Mastered', color: '#34d399', bg: 'rgba(52,211,153,0.12)' }
    : status === 'attempted'
    ? { label: 'Attempted', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' }
    : null

  return (
    <button
      type="button"
      style={{ ...styles.card, ...(hover ? styles.cardHover : {}) }}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={styles.corner} aria-hidden />

      {statusBadge && (
        <div style={{
          position: 'absolute', top: 12, right: 12,
          fontSize: 10, fontWeight: 700,
          color: statusBadge.color,
          background: statusBadge.bg,
          border: `1px solid ${statusBadge.color}30`,
          padding: '2px 10px', borderRadius: 20,
          letterSpacing: '0.04em',
        }}>
          {statusBadge.label}
        </div>
      )}

      {topicId && (
        <div style={styles.iconWrap}>
          <TopicIcon topicId={topicId} />
        </div>
      )}
      <h3 style={styles.title}>{title}</h3>
      {subtitle && <p style={styles.subtitle}>{subtitle}</p>}
      {matchPercent != null && <p style={styles.match}>{matchPercent}% match</p>}
      <p style={styles.footer}>
        {status === 'mastered' ? 'Practice again →' : status === 'attempted' ? 'Retry →' : 'Start →'}
      </p>
    </button>
  )
})
