import { useState } from 'react'
import { motion } from 'framer-motion'
import TopicIcon from '../TopicIcon'
import { matchColor } from './icons'

export default function HeroRecommCard({ title, matchPercent, masteryScore, topicId, reason, onClick, attempts = 0 }) {
  const [hover, setHover] = useState(false)
  const isNew = attempts === 0
  const color = isNew ? '#818cf8' : matchColor(matchPercent)
  const masteryColor = masteryScore >= 80 ? 'var(--accent-success)' : masteryScore >= 50 ? 'var(--accent-warning)' : '#818cf8'

  return (
    <motion.button
      type="button"
      onClick={onClick}
      onHoverStart={() => setHover(true)}
      onHoverEnd={() => setHover(false)}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.18 }}
      style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '18px 20px', borderRadius: 18, width: '100%',
        background: hover
          ? 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.06))'
          : 'var(--bg-card)',
        border: `1.5px solid ${hover ? 'rgba(99,102,241,0.35)' : 'var(--border-light)'}`,
        borderLeft: `3px solid ${color}`,
        cursor: 'pointer', textAlign: 'left',
        boxShadow: hover ? '0 10px 32px rgba(99,102,241,0.12)' : '0 1px 4px rgba(0,0,0,0.06)',
        transition: 'border-color 0.2s, background 0.2s, box-shadow 0.2s',
      }}
    >
      <TopicIcon topicId={topicId} size="small" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          margin: 0, fontWeight: 700, fontSize: 15,
          color: 'var(--primary-text)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {title}
        </p>
        {reason && (
          <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--primary-text-muted)', lineHeight: 1.4 }}>
            {reason}
          </p>
        )}
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          background: `${color}15`, border: `1px solid ${color}30`,
          borderRadius: 8, padding: '3px 10px',
        }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: isNew ? 12 : 15, color }}>
            {isNew ? 'NEW' : `${matchPercent}%`}
          </span>
        </div>
        {!isNew && (
          <span style={{ fontSize: 10, color: 'var(--primary-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>mastery</span>
        )}
        {masteryScore > 0 && !isNew && (
          <span style={{ fontSize: 10, fontWeight: 700, color: masteryColor }}>
            {masteryScore}% mastery
          </span>
        )}
      </div>
    </motion.button>
  )
}
