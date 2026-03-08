import { useState, useMemo, useEffect, memo } from 'react'
import { useForum } from '../hooks/useForum'
import PostCard from '../components/PostCard'
import Skeleton from '../components/Skeleton'
import EmptyIllustration from '../components/EmptyIllustration'
import AppNav from '../components/AppNav'

// ─── Inline debounce hook (no extra dep) ─────────────────────────────────────
function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

// ─── Module-level style constants ────────────────────────────────────────────
const S = {
  page:     { minHeight: '100vh', background: 'var(--primary-bg)' },
  hero:     { background: 'linear-gradient(180deg, rgba(99,102,241,0.08) 0%, transparent 100%)', borderBottom: '1px solid var(--border-light)', padding: '36px 24px 28px' },
  heroInner:{ maxWidth: 900, margin: '0 auto' },
  heroTop:  { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 },
  newBtn:   { display: 'flex', alignItems: 'center', gap: 7, padding: '11px 22px', borderRadius: 12, background: 'var(--gradient-accent)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', flexShrink: 0, boxShadow: '0 4px 14px rgba(99,102,241,0.4)', fontFamily: 'var(--font-display)' },
  statsRow: { display: 'flex', gap: 24, marginTop: 20, flexWrap: 'wrap' },
  main:     { maxWidth: 900, margin: '0 auto', padding: '28px 24px 80px' },
  toolbar:  { display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
  searchWrap:{ flex: 1, minWidth: 200, position: 'relative', display: 'flex', alignItems: 'center' },
  searchIcon:{ position: 'absolute', left: 14, color: 'var(--primary-text-muted)', pointerEvents: 'none', display: 'flex' },
  searchInput:{ width: '100%', padding: '11px 16px 11px 40px', borderRadius: 12, border: '1px solid var(--border-medium)', background: 'var(--bg-card)', color: 'var(--primary-text)', fontSize: 14, fontFamily: 'var(--font-body)', boxSizing: 'border-box', outline: 'none' },
  sortRow:  { display: 'flex', gap: 4, background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 12, padding: 4 },
  tagStrip: { display: 'flex', gap: 6, marginBottom: 24, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' },
  emptyWrap:{ textAlign: 'center', padding: '80px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 },
  emptyIcon:{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(99,102,241,0.1)', border: '2px solid rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 },
  feedCol:  { display: 'flex', flexDirection: 'column', gap: 10 },
}

// ─── Stable icon components ───────────────────────────────────────────────────
const PlusIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
)
const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
)
const SpinnerIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
    style={{ animation: 'spin 0.8s linear infinite' }}>
    <path d="M12 2a10 10 0 0 1 10 10"/>
  </svg>
)
const FilmIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
    <line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
    <line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/>
    <line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/>
  </svg>
)

// ─── AI tag generation ────────────────────────────────────────────────────────
const TOPIC_KEYWORDS = {
  '#kinematics':    ['kinematics','velocity','acceleration','displacement','suvat','motion'],
  '#forces':        ['force','newton','friction','tension','normal','weight','pressure'],
  '#energy':        ['energy','work','power','kinetic','potential','conservation','joule'],
  '#waves':         ['wave','frequency','wavelength','amplitude','sound','longitudinal','transverse'],
  '#light':         ['light','reflection','refraction','snell','optics','lens','mirror'],
  '#electricity':   ['current','voltage','resistance','circuit','ohm','charge','electric'],
  '#magnetism':     ['magnet','magnetic','field','solenoid','motor','induction','flux'],
  '#heat':          ['heat','temperature','thermal','conduction','convection','radiation','specific'],
  '#gravity':       ['gravity','gravitational','orbit','satellite','weight','planet','free-fall'],
  '#atoms':         ['atom','nuclear','decay','half-life','proton','neutron','electron','radioactive'],
  '#projectile':    ['projectile','horizontal','vertical','trajectory','launch','angle'],
  '#free-fall':     ['free fall','freefall','drop','falling','terminal'],
  "#Newton's-laws": ['newton','inertia','action','reaction','resultant','net force'],
}

function fallbackTags(text) {
  const lower = text.toLowerCase()
  return Object.entries(TOPIC_KEYWORDS)
    .filter(([, kws]) => kws.some(kw => lower.includes(kw)))
    .map(([tag]) => tag)
    .slice(0, 5)
}

async function aiGenerateTags(title, body) {
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: 'You are a physics tag classifier. Return only a valid JSON array of tag strings.' },
          { role: 'user', content: `Given this physics student question, return ONLY a JSON array of 4-6 short tag strings (lowercase, use hyphens for spaces, start each with #). No explanation, no markdown.\n\nTitle: ${title}\nBody: ${body}` },
        ]
      })
    })
    if (!res.ok) throw new Error()
    const data  = await res.json()
    const match = (data.reply || '').match(/\[[\s\S]*?\]/)
    return match ? JSON.parse(match[0]) : fallbackTags(title + ' ' + body)
  } catch {
    return fallbackTags(title + ' ' + body)
  }
}

// ─── New-post modal ───────────────────────────────────────────────────────────
const NewPostModal = memo(function NewPostModal({ onClose, onSubmit, tagging }) {
  const [title, setTitle] = useState('')
  const [body, setBody]   = useState('')
  const canSubmit = title.trim().length > 8 && body.trim().length > 10 && !tagging

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <div style={{ background: 'var(--primary-bg)', border: '1px solid var(--border-medium)', borderRadius: 20, padding: '28px 32px', width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 20, boxShadow: '0 24px 80px rgba(0,0,0,0.45)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--primary-text)' }}>Ask the community</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--primary-text-muted)' }}>AI will auto-tag your question so others find it.</p>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid var(--border-light)', color: 'var(--primary-text-muted)', width: 32, height: 32, borderRadius: 8, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>

        <div style={{ height: 1, background: 'var(--border-light)' }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--primary-text-muted)' }}>Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Why does a ball slow down on a ramp?" maxLength={120}
            style={{ padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border-medium)', background: 'var(--bg-card)', color: 'var(--primary-text)', fontSize: 15, fontFamily: 'var(--font-body)', outline: 'none' }}
          />
          <span style={{ fontSize: 11, color: 'var(--primary-text-muted)', alignSelf: 'flex-end' }}>{title.length}/120</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--primary-text-muted)' }}>Details</label>
          <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Explain what you understand so far and what's confusing you..." rows={5}
            style={{ padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border-medium)', background: 'var(--bg-card)', color: 'var(--primary-text)', fontSize: 14, fontFamily: 'var(--font-body)', resize: 'vertical', lineHeight: 1.6, outline: 'none' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={onClose} style={{ flex: 1, padding: '13px 0', borderRadius: 12, background: 'var(--bg-card)', color: 'var(--primary-text-muted)', border: '1px solid var(--border-light)', fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Cancel
          </button>
          <button type="button" onClick={() => canSubmit && onSubmit(title.trim(), body.trim())} disabled={!canSubmit}
            style={{ flex: 2, padding: '13px 0', borderRadius: 12, background: canSubmit ? 'var(--gradient-accent)' : 'var(--bg-card)', color: canSubmit ? '#fff' : 'var(--primary-text-muted)', border: '1px solid var(--border-light)', fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, cursor: canSubmit ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: canSubmit ? '0 4px 14px rgba(99,102,241,0.4)' : 'none' }}>
            {tagging ? <><SpinnerIcon /> AI tagging…</> : 'Post question →'}
          </button>
        </div>
      </div>
    </div>
  )
})

// ─── Main Forum screen ────────────────────────────────────────────────────────

function collectTags(posts) {
  const all = posts.flatMap(p => p.tags || [])
  return [...new Set(all)].sort()
}

export default function Forum() {
  // Single useForum() call — all state from the same context instance
  const { posts, loading, upvotePost, hasUpvoted, addPost } = useForum()

  const [showModal, setShowModal] = useState(false)
  const [tagging, setTagging]     = useState(false)
  const [activeTag, setActiveTag] = useState(null)
  const [rawSearch, setRawSearch] = useState('')
  const [sort, setSort]           = useState('newest')
  const [visibleCount, setVisibleCount] = useState(8)

  const POSTS_PER_PAGE = 8

  // Debounce search so useMemo only fires after 250ms idle
  const search = useDebounce(rawSearch, 250)

  const allTags      = useMemo(() => collectTags(posts), [posts])
  const totalReplies = useMemo(() => posts.reduce((s, p) => s + (p.replies?.length ?? 0), 0), [posts])
  const videoCount   = useMemo(() => posts.filter(p => p.videoUrl).length, [posts])

  // Reset pagination when any filter changes — must be useEffect, not inside useMemo
  useEffect(() => {
    setVisibleCount(POSTS_PER_PAGE)
  }, [activeTag, search, sort])

  const filtered = useMemo(() => {
    let result = posts
    if (activeTag) result = result.filter(p => p.tags?.includes(activeTag))
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(p =>
        p.title.toLowerCase().includes(q) ||
        p.body?.toLowerCase().includes(q) ||
        p.tags?.some(t => t.toLowerCase().includes(q))
      )
    }
    if (sort === 'discussed') return [...result].sort((a, b) => (b.replies?.length ?? 0) - (a.replies?.length ?? 0))
    if (sort === 'top')       return [...result].sort((a, b) => (b.upvotes ?? 0) - (a.upvotes ?? 0))
    return result
  }, [posts, activeTag, search, sort])

  const handleSubmitSafe = async (title, body) => {
    setTagging(true)
    const tags = await aiGenerateTags(title, body)
    addPost(title, body, tags)
    setTagging(false)
    setShowModal(false)
  }

  const SORT_OPTIONS = [['newest', 'Latest'], ['top', 'Top'], ['discussed', 'Discussed']]

  return (
    <div style={S.page}>
      <AppNav />

      {/* ── Hero ── */}
      <div style={S.hero}>
        <div style={S.heroInner}>
          <div style={S.heroTop}>
            <div>
              <h1 style={{ margin: '0 0 6px', fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 800, color: 'var(--primary-text)', letterSpacing: '-0.03em', lineHeight: 1.2 }}>
                Community
              </h1>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--primary-text-muted)', lineHeight: 1.5 }}>
                Ask, discuss, and learn together. Every post is AI-tagged and linked to the chatbot.
              </p>
            </div>
            <button type="button" onClick={() => setShowModal(true)} style={S.newBtn}>
              <PlusIcon /> New post
            </button>
          </div>

          {/* Stats */}
          <div style={S.statsRow}>
            {[
              { label: 'Posts',      value: posts.length },
              { label: 'Replies',    value: totalReplies },
              { label: 'Topics',     value: allTags.length },
              { label: 'Animations', value: videoCount, icon: <FilmIcon /> },
            ].map(({ label, value, icon }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, color: 'var(--accent-main)' }}>{value}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--primary-text-muted)', fontWeight: 600 }}>
                  {icon} {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <main style={S.main}>
        {/* ── Toolbar ── */}
        <div style={S.toolbar}>
          <div style={S.searchWrap}>
            <span style={S.searchIcon}><SearchIcon /></span>
            <input
              type="text"
              value={rawSearch}
              onChange={e => setRawSearch(e.target.value)}
              placeholder="Search posts, tags, concepts..."
              style={S.searchInput}
            />
          </div>
          <div style={S.sortRow}>
            {SORT_OPTIONS.map(([val, label]) => (
              <button key={val} type="button" onClick={() => setSort(val)} style={{
                padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: sort === val ? 'var(--gradient-accent)' : 'transparent',
                color: sort === val ? '#fff' : 'var(--primary-text-muted)',
                border: 'none', cursor: 'pointer',
                boxShadow: sort === val ? '0 2px 8px rgba(99,102,241,0.35)' : 'none',
                transition: 'all 0.15s ease',
              }}>{label}</button>
            ))}
          </div>
        </div>

        {/* ── Tag chips ── */}
        {allTags.length > 0 && (
          <div style={S.tagStrip}>
            <button type="button" onClick={() => setActiveTag(null)} style={{
              padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
              border: '1px solid var(--border-medium)', cursor: 'pointer', flexShrink: 0,
              background: !activeTag ? 'var(--gradient-accent)' : 'var(--bg-card)',
              color: !activeTag ? '#fff' : 'var(--primary-text-muted)',
              boxShadow: !activeTag ? '0 2px 8px rgba(99,102,241,0.3)' : 'none',
              transition: 'all 0.15s ease',
            }}>All</button>
            {allTags.map(tag => (
              <button key={tag} type="button" onClick={() => setActiveTag(tag === activeTag ? null : tag)} style={{
                padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, flexShrink: 0,
                border: `1px solid ${tag === activeTag ? 'rgba(99,102,241,0.5)' : 'var(--border-light)'}`,
                background: tag === activeTag ? 'rgba(99,102,241,0.15)' : 'var(--bg-card)',
                color: tag === activeTag ? 'var(--accent-main)' : 'var(--primary-text-muted)',
                cursor: 'pointer', transition: 'all 0.15s ease',
              }}>{tag}</button>
            ))}
          </div>
        )}

        {/* Result count */}
        {(search || activeTag) && (
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--primary-text-muted)' }}>
            {filtered.length} result{filtered.length !== 1 ? 's' : ''}
            {activeTag && <> for <strong style={{ color: 'var(--accent-main)' }}>{activeTag}</strong></>}
            {search && <> matching <strong style={{ color: 'var(--primary-text)' }}>"{search}"</strong></>}
          </p>
        )}

        {/* ── Feed ── */}
        {loading ? (
          <div style={S.feedCol}>
            {[0, 1, 2, 3].map(i => <Skeleton key={i} height={110} borderRadius={16} delay={i * 0.08} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div style={S.emptyWrap}>
            <EmptyIllustration type="no-posts" size={72} />
            <div>
              <p style={{ fontSize: 17, fontWeight: 600, color: 'var(--primary-text)', margin: '0 0 6px', fontFamily: 'var(--font-display)' }}>Nothing here yet</p>
              <p style={{ fontSize: 14, color: 'var(--primary-text-muted)', margin: 0 }}>No posts match your filter — try clearing it or start a discussion.</p>
            </div>
            <button type="button" onClick={() => { setShowModal(true); setActiveTag(null); setRawSearch('') }}
              style={{ color: '#fff', background: 'var(--gradient-accent)', border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: 14, padding: '10px 22px', borderRadius: 10, boxShadow: '0 4px 14px rgba(99,102,241,0.4)' }}>
              Post a question →
            </button>
          </div>
        ) : (
          <>
            <div style={S.feedCol}>
              {filtered.slice(0, visibleCount).map(post => (
                <PostCard
                  key={post.id}
                  post={post}
                  onUpvote={upvotePost}
                  didUpvote={hasUpvoted(post.id)}
                />
              ))}
            </div>
            {visibleCount < filtered.length && (
              <div style={{ textAlign: 'center', marginTop: 24 }}>
                <button
                  type="button"
                  onClick={() => setVisibleCount(c => c + POSTS_PER_PAGE)}
                  style={{
                    padding: '11px 28px', borderRadius: 12,
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-light)',
                    color: 'var(--primary-text-muted)',
                    fontSize: 14, fontWeight: 600, cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                >
                  Load more ({filtered.length - visibleCount} remaining)
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {showModal && (
        <NewPostModal
          onClose={() => !tagging && setShowModal(false)}
          onSubmit={handleSubmitSafe}
          tagging={tagging}
        />
      )}

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}::-webkit-scrollbar{display:none}`}</style>
    </div>
  )
}
