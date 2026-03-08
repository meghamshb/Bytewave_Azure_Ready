import { memo, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

// ─── Utilities (module-level, computed once) ──────────────────────────────────

export function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (diff < 60)    return `${diff}s ago`
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

const AVATAR_PALETTE = [
  { bg: '#6366f1', fg: '#818cf8' },
  { bg: '#8b5cf6', fg: '#a78bfa' },
  { bg: '#06b6d4', fg: '#22d3ee' },
  { bg: '#10b981', fg: '#34d399' },
  { bg: '#f59e0b', fg: '#fcd34d' },
  { bg: '#ef4444', fg: '#f87171' },
  { bg: '#ec4899', fg: '#f472b6' },
  { bg: '#14b8a6', fg: '#2dd4bf' },
]

function paletteFor(name = '') {
  return AVATAR_PALETTE[(name.charCodeAt(0) || 0) % AVATAR_PALETTE.length]
}

// ─── Shared sub-components ────────────────────────────────────────────────────

export const Avatar = memo(function Avatar({ name, size = 36, style: extra = {} }) {
  const { bg, fg } = paletteFor(name)
  const initials = name
    ? name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?'
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `linear-gradient(135deg, ${bg}, ${fg})`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.36), fontWeight: 700, color: '#fff',
      letterSpacing: '-0.02em', fontFamily: 'var(--font-display)',
      boxShadow: '0 0 0 2px rgba(255,255,255,0.1), 0 2px 8px rgba(0,0,0,0.25)',
      userSelect: 'none',
      ...extra,
    }}>
      {initials}
    </div>
  )
})

// Stable SVG components (no state, no closure — React reuses the same node)
const UpArrow = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 4L3 15h6v5h6v-5h6L12 4z" />
  </svg>
)

const ReplyIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
)

const PlayIcon = () => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
)

// ─── Module-level style constants (no new objects per render) ─────────────────

const S = {
  card:       { display: 'flex', borderRadius: 18, overflow: 'hidden', transition: 'all 0.18s ease' },
  cardBase:   { background: 'var(--bg-card)',       border: '1px solid var(--border-light)',       boxShadow: '0 1px 4px rgba(0,0,0,0.06)',  transform: 'none' },
  cardHover:  { background: 'var(--bg-card-hover)', border: '1px solid rgba(99,102,241,0.28)',     boxShadow: '0 8px 28px rgba(0,0,0,0.18), 0 0 0 1px rgba(99,102,241,0.12)', transform: 'translateY(-2px)' },
  upvoteCol:  { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, borderRight: '1px solid var(--border-light)', flexShrink: 0 },
  upvoteColFull:    { padding: '18px 14px', minWidth: 54 },
  upvoteColCompact: { padding: '14px 12px', minWidth: 46 },
  upvotedBg:  { background: 'rgba(99,102,241,0.06)' },
  upvoteBtn:  { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer', padding: '6px 8px', borderRadius: 10, transition: 'all 0.15s ease' },
  content:    { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' },
  contentFull:    { padding: '18px 18px 16px' },
  contentCompact: { padding: '14px 16px' },
  animBadge:  { display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#a78bfa', background: 'rgba(139,92,246,0.14)', border: '1px solid rgba(139,92,246,0.28)', padding: '3px 10px', borderRadius: 20 },
  authorRow:  { display: 'flex', alignItems: 'center', gap: 10 },
  authorMeta: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  tagRow:     { display: 'flex', flexWrap: 'wrap', gap: 5, flex: 1, overflow: 'hidden' },
  tag:        { fontSize: 11, fontWeight: 600, color: 'var(--accent-main)', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.18)', padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap' },
  tagExtra:   { fontSize: 11, fontWeight: 600, color: 'var(--primary-text-muted)', background: 'var(--bg-card)', border: '1px solid var(--border-light)', padding: '2px 8px', borderRadius: 20 },
  footer:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
}

const MAX_TAGS = 3

// ─── PostCard ─────────────────────────────────────────────────────────────────
// Props:
//   post      — post object
//   onUpvote  — (postId) => void  — from parent's useForum
//   didUpvote — boolean           — precomputed by parent

function PostCard({ post, onUpvote, didUpvote = false, compact = false, variant = 'default' }) {
  const isTip = variant === 'tip'
  const navigate   = useNavigate()
  const [hover, setHover] = useState(false)

  const replyCount  = post.replies?.length ?? 0
  const visibleTags = useMemo(() => post.tags?.slice(0, MAX_TAGS) ?? [], [post.tags])
  const extraTags   = Math.max(0, (post.tags?.length ?? 0) - MAX_TAGS)

  const handleUpvote = (e) => {
    e.stopPropagation()
    onUpvote(post.id)
  }

  const cardStyle = {
    ...S.card,
    ...(hover ? S.cardHover : S.cardBase),
  }

  const isCompactLayout = compact || isTip

  const upvoteColStyle = {
    ...S.upvoteCol,
    ...(isCompactLayout ? S.upvoteColCompact : S.upvoteColFull),
    ...(didUpvote ? S.upvotedBg : {}),
  }

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={cardStyle}
    >
      {/* ── Left: Upvote column ── */}
      <div style={upvoteColStyle}>
        <button
          type="button"
          onClick={handleUpvote}
          title={didUpvote ? 'Remove upvote' : 'Upvote'}
          style={{
            ...S.upvoteBtn,
            color: didUpvote ? 'var(--accent-main)' : 'var(--primary-text-muted)',
          }}
        >
          <UpArrow />
          <span style={{
            fontSize: compact ? 12 : 13, fontWeight: 700,
            fontFamily: 'var(--font-display)',
            color: didUpvote ? 'var(--accent-main)' : 'var(--primary-text-muted)',
          }}>
            {post.upvotes ?? 0}
          </span>
        </button>
      </div>

      {/* ── Right: Content ── */}
      <button
        type="button"
        onClick={() => !isTip && navigate(`/forum/${post.id}`)}
        style={{ ...S.content, ...(isCompactLayout ? S.contentCompact : S.contentFull), ...(isTip ? { cursor: 'default' } : {}) }}
      >
        {/* Animation badge */}
        {!isTip && post.videoUrl && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: -2 }}>
            <div style={S.animBadge}><PlayIcon /> Manim animation</div>
          </div>
        )}

        {/* Author row */}
        <div style={S.authorRow}>
          <Avatar name={post.author} size={isCompactLayout ? 26 : 32} />
          <div style={S.authorMeta}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary-text)' }}>{post.author}</span>
            <span style={{ fontSize: 12, color: 'var(--primary-text-muted)' }}>·</span>
            <span style={{ fontSize: 12, color: 'var(--primary-text-muted)' }}>{timeAgo(post.createdAt)}</span>
          </div>
        </div>

        {isTip ? (
          <p style={{
            margin: 0, fontSize: 13, color: 'var(--primary-text)', lineHeight: 1.55,
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {post.body || post.title}
          </p>
        ) : (
          <>
            {/* Title */}
            <p style={{
              margin: 0, fontFamily: 'var(--font-display)',
              fontSize: isCompactLayout ? 14 : 15, fontWeight: 700, color: 'var(--primary-text)',
              lineHeight: 1.45, display: '-webkit-box',
              WebkitLineClamp: isCompactLayout ? 2 : 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
              {post.title}
            </p>

            {/* Body preview */}
            {!isCompactLayout && post.body && (
              <p style={{
                margin: 0, fontSize: 13, color: 'var(--primary-text-muted)', lineHeight: 1.55,
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              }}>
                {post.body}
              </p>
            )}

            {/* Footer */}
            <div style={S.footer}>
              <div style={S.tagRow}>
                {visibleTags.map(tag => (
                  <span key={tag} style={S.tag}>{tag}</span>
                ))}
                {extraTags > 0 && <span style={S.tagExtra}>+{extraTags}</span>}
              </div>
              <span style={{
                display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 12, fontWeight: 600, flexShrink: 0,
                color: replyCount > 0 ? 'var(--accent-main)' : 'var(--primary-text-muted)',
                background: replyCount > 0 ? 'rgba(99,102,241,0.09)' : 'transparent',
                border: replyCount > 0 ? '1px solid rgba(99,102,241,0.18)' : 'none',
                padding: replyCount > 0 ? '3px 10px 3px 8px' : '0',
                borderRadius: 20,
              }}>
                <ReplyIcon /> {replyCount}
              </span>
            </div>
          </>
        )}
      </button>
    </div>
  )
}

export default memo(PostCard)
