import { useState, memo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useForum } from '../hooks/useForum'
import { Avatar, timeAgo } from '../components/PostCard'
import EmptyIllustration from '../components/EmptyIllustration'
import AppNav from '../components/AppNav'

const ArrowLeft = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
  </svg>
)

const UpArrow = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 4L3 15h6v5h6v-5h6L12 4z" />
  </svg>
)

const SendIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
)

/* ── Upvote button ── */
const UpvoteBtn = memo(function UpvoteBtn({ count, active, onClick, size = 'md' }) {
  const [hover, setHover] = useState(false)
  const sm = size === 'sm'
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={active ? 'Remove upvote' : 'Upvote'}
      style={{
        display: 'flex', alignItems: 'center', gap: sm ? 4 : 5,
        padding: sm ? '4px 10px' : '6px 14px',
        borderRadius: 20, border: 'none', cursor: 'pointer',
        background: active
          ? 'rgba(99,102,241,0.18)'
          : hover ? 'rgba(99,102,241,0.09)' : 'var(--bg-card)',
        color: active ? 'var(--accent-main)' : hover ? 'var(--accent-main)' : 'var(--primary-text-muted)',
        fontFamily: 'var(--font-display)',
        fontSize: sm ? 12 : 13, fontWeight: 700,
        transition: 'all 0.15s ease',
        borderWidth: 1, borderStyle: 'solid',
        borderColor: active ? 'rgba(99,102,241,0.4)' : hover ? 'rgba(99,102,241,0.25)' : 'var(--border-light)',
        transform: hover && !active ? 'translateY(-1px)' : 'none',
        boxShadow: active ? '0 2px 8px rgba(99,102,241,0.25)' : 'none',
      }}
    >
      <UpArrow />
      <span>{count ?? 0}</span>
    </button>
  )
})

/* ── Single reply bubble (memoised — only re-renders when its own upvote changes) ── */
const ReplyBubble = memo(function ReplyBubble({ reply, postId, upvoteReply, hasUpvoted }) {
  const isInstructor = reply.author === 'Physics Lab'
  const didUpvote    = hasUpvoted(`${postId}:${reply.id}`)

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      {/* Avatar */}
      <Avatar name={reply.author} size={36} />

      {/* Bubble */}
      <div style={{
        flex: 1,
        borderRadius: '4px 18px 18px 18px',
        background: isInstructor ? 'rgba(99,102,241,0.06)' : 'var(--bg-card)',
        border: `1px solid ${isInstructor ? 'rgba(99,102,241,0.2)' : 'var(--border-light)'}`,
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '12px 16px 10px',
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          borderBottom: '1px solid var(--border-light)',
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary-text)' }}>
            {reply.author}
          </span>
          {isInstructor && (
            <span style={{
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em',
              color: 'var(--accent-main)', background: 'rgba(99,102,241,0.12)',
              border: '1px solid rgba(99,102,241,0.22)', padding: '1px 8px', borderRadius: 20,
            }}>Instructor</span>
          )}
          <span style={{ fontSize: 12, color: 'var(--primary-text-muted)', marginLeft: 'auto' }}>
            {timeAgo(reply.createdAt)}
          </span>
        </div>

        {/* Body */}
        <p style={{
          margin: 0, padding: '12px 16px',
          fontSize: 14, color: 'var(--primary-text)', lineHeight: 1.7, whiteSpace: 'pre-wrap',
        }}>
          {reply.body}
        </p>

        {/* Footer: upvote */}
        <div style={{ padding: '8px 16px 12px', display: 'flex', alignItems: 'center' }}>
          <UpvoteBtn
            count={reply.upvotes}
            active={didUpvote}
            size="sm"
            onClick={() => upvoteReply(postId, reply.id)}
          />
        </div>
      </div>
    </div>
  )
})

export default function ForumPost() {
  const { postId }                                      = useParams()
  const navigate                                        = useNavigate()
  const { getPost, addReply, upvotePost, upvoteReply, hasUpvoted } = useForum()

  const post = getPost(postId)

  const [replyText,  setReplyText]  = useState('')
  const [name,       setName]       = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!post) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--primary-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 52 }}>🌀</div>
          <p style={{ fontSize: 18, color: 'var(--primary-text-muted)', margin: 0 }}>Post not found.</p>
          <button type="button" onClick={() => navigate('/forum')} style={{
            color: '#fff', background: 'var(--gradient-accent)', border: 'none',
            fontWeight: 700, cursor: 'pointer', fontSize: 14,
            padding: '10px 22px', borderRadius: 10,
          }}>← Back to community</button>
        </div>
      </div>
    )
  }

  const handleReply = () => {
    const text = replyText.trim()
    if (!text || text.length < 5 || submitting) return
    setSubmitting(true)
    addReply(post.id, text, name.trim() || 'Student')
    setReplyText('')
    setName('')
    setSubmitting(false)
  }

  const canReply   = replyText.trim().length >= 5 && !submitting
  const didUpvote  = hasUpvoted(post.id)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--primary-bg)' }}>

      <AppNav />

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '24px 24px 80px', display: 'flex', flexDirection: 'column', gap: 28 }}>

        {/* ── Breadcrumb ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" onClick={() => navigate('/forum')} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--primary-text-muted)', fontSize: 13, fontWeight: 600, padding: 0,
          }}>
            <ArrowLeft /> Community
          </button>
          <span style={{ color: 'var(--border-medium)' }}>/</span>
          <span style={{
            fontSize: 13, color: 'var(--primary-text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            maxWidth: 400,
          }}>{post.title}</span>
        </div>

        {/* ── Original post ── */}
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-light)',
          borderRadius: 20, overflow: 'hidden',
        }}>
          {/* Gradient top stripe */}
          <div style={{
            height: 4,
            background: post.videoUrl
              ? 'linear-gradient(90deg, #6366f1, #8b5cf6, #06b6d4)'
              : 'linear-gradient(90deg, #6366f1, #818cf8)',
          }} />

          {/* Video */}
          {post.videoUrl && (
            <div style={{ position: 'relative', background: '#000' }}>
              <video
                src={post.videoUrl}
                controls loop playsInline
                style={{ width: '100%', maxHeight: 420, display: 'block', objectFit: 'contain', background: '#000' }}
              />
              <div style={{
                position: 'absolute', top: 12, left: 12,
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)',
                border: '1px solid rgba(139,92,246,0.5)',
                borderRadius: 20, padding: '4px 12px',
              }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#a78bfa', animation: 'pulse 2s ease-in-out infinite' }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.9)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Manim · physics.bytewave
                </span>
              </div>
            </div>
          )}

          {/* Post body */}
          <div style={{ padding: '24px 26px', display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Author + time */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Avatar name={post.author} size={42} />
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--primary-text)' }}>{post.author}</p>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--primary-text-muted)' }}>{timeAgo(post.createdAt)}</p>
              </div>
            </div>

            {/* Title */}
            <h1 style={{
              margin: 0, fontFamily: 'var(--font-display)',
              fontSize: 22, fontWeight: 800, color: 'var(--primary-text)',
              lineHeight: 1.35, letterSpacing: '-0.02em',
            }}>
              {post.title}
            </h1>

            {/* Body */}
            {post.body && (
              <div style={{
                padding: '16px 20px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--border-light)',
                borderRadius: 12,
              }}>
                <p style={{ margin: 0, fontSize: 15, color: 'var(--primary-text)', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>
                  {post.body}
                </p>
              </div>
            )}

            {/* Tags */}
            {post.tags?.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--primary-text-muted)', marginRight: 2 }}>
                  AI tags
                </span>
                {post.tags.map(tag => (
                  <span key={tag} style={{
                    fontSize: 12, fontWeight: 600, color: 'var(--accent-main)',
                    background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)',
                    padding: '3px 10px', borderRadius: 20,
                  }}>{tag}</span>
                ))}
              </div>
            )}

            {/* Post-level upvote + reply count */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 4, borderTop: '1px solid var(--border-light)' }}>
              <UpvoteBtn
                count={post.upvotes}
                active={didUpvote}
                onClick={() => upvotePost(post.id)}
              />
              <span style={{ fontSize: 13, color: 'var(--primary-text-muted)' }}>
                {post.replies?.length ?? 0} {post.replies?.length === 1 ? 'reply' : 'replies'}
              </span>
            </div>
          </div>
        </div>

        {/* ── Replies ── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--primary-text)' }}>
              {post.replies.length === 0 ? 'Discussion' : 'Replies'}
            </h2>
            {post.replies.length > 0 && (
              <span style={{
                padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                background: 'rgba(99,102,241,0.12)', color: 'var(--accent-main)',
                border: '1px solid rgba(99,102,241,0.2)',
              }}>{post.replies.length}</span>
            )}
          </div>

          {post.replies.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '40px 20px',
              background: 'var(--bg-card)', border: '1px solid var(--border-light)',
              borderRadius: 16, color: 'var(--primary-text-muted)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
            }}>
              <EmptyIllustration type="no-replies" size={72} />
              <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>No replies yet</p>
              <p style={{ margin: 0, fontSize: 13 }}>Be the first to help out below ↓</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {post.replies.map(r => (
                <ReplyBubble
                  key={r.id}
                  reply={r}
                  postId={post.id}
                  upvoteReply={upvoteReply}
                  hasUpvoted={hasUpvoted}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Reply form ── */}
        <div style={{
          padding: '24px 26px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-light)',
          borderRadius: 20,
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--primary-text)' }}>
            Add a reply
          </h3>

          {/* Name field */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar name={name || 'Student'} size={36} />
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your name (optional)"
              maxLength={40}
              style={{
                flex: 1, padding: '9px 14px', borderRadius: 10,
                border: '1px solid var(--border-medium)',
                background: 'var(--primary-bg)',
                color: 'var(--primary-text)', fontSize: 13,
                fontFamily: 'var(--font-body)', outline: 'none',
              }}
            />
          </div>

          {/* Textarea */}
          <div style={{
            border: '1px solid var(--border-medium)', borderRadius: 14,
            overflow: 'hidden', background: 'var(--primary-bg)',
          }}>
            <textarea
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              placeholder="Share your explanation, approach, or helpful tip..."
              rows={4}
              style={{
                width: '100%', padding: '14px 16px',
                border: 'none', outline: 'none',
                background: 'transparent',
                color: 'var(--primary-text)', fontSize: 14,
                fontFamily: 'var(--font-body)', resize: 'none', lineHeight: 1.65,
                boxSizing: 'border-box',
              }}
            />
            {/* Toolbar */}
            <div style={{
              padding: '10px 14px',
              borderTop: '1px solid var(--border-light)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: 12, color: 'var(--primary-text-muted)' }}>
                {replyText.length > 0 ? `${replyText.length} chars` : 'Min 5 characters'}
              </span>
              <button
                type="button"
                onClick={handleReply}
                disabled={!canReply}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '8px 18px', borderRadius: 10,
                  background: canReply ? 'var(--gradient-accent)' : 'var(--bg-card)',
                  color: canReply ? '#fff' : 'var(--primary-text-muted)',
                  border: '1px solid var(--border-light)',
                  fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700,
                  cursor: canReply ? 'pointer' : 'not-allowed',
                  boxShadow: canReply ? '0 2px 10px rgba(99,102,241,0.35)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                <SendIcon /> Post reply
              </button>
            </div>
          </div>

          <p style={{ margin: 0, fontSize: 12, color: 'var(--primary-text-muted)' }}>
            Keep it constructive — your reply helps others who are stuck on the same topic.
          </p>
        </div>
      </main>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.6; transform: scale(0.85); }
        }
      `}</style>
    </div>
  )
}
