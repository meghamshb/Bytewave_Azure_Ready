import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import Skeleton from '../components/Skeleton'
import TopicIcon from '../components/TopicIcon'
import EmptyIllustration from '../components/EmptyIllustration'
import OnboardingFlow, { useOnboarding } from '../components/OnboardingFlow'
import { useAuth, useUserId } from '../hooks/useAuth'
import { track, EVENTS } from '../hooks/useAnalytics'

// ─── Tiny icon set ───────────────────────────────────────────────────────────
const IcoArrow = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
)
const IcoStar = () => (
  <svg width={13} height={13} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
)
const IcoFlame = () => (
  <svg width={13} height={13} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c0 0-4 4-4 9a4 4 0 0 0 8 0c0-1.5-.5-3-1.5-4.5C14 8 12 10 12 12c0-4-4-6-4-6s1 3 0 5c0-5 4-9 4-9z"/></svg>
)
const IcoZap = () => (
  <svg width={13} height={13} viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
)
const IcoCheck = () => (
  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
)

// ─── Match colour helper ──────────────────────────────────────────────────────
const matchColor = (pct) =>
  pct >= 85 ? 'var(--accent-success)' : pct >= 65 ? 'var(--accent-warning)' : '#818cf8'

// ─── Stat chip ───────────────────────────────────────────────────────────────
function StatChip({ icon, value, label, color = '#818cf8' }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '16px 20px', borderRadius: 16,
      background: 'var(--bg-card)',
      border: '1px solid var(--border-light)',
      flex: '1 1 140px', minWidth: 0,
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
        background: `${color}18`,
        border: `1px solid ${color}30`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color,
      }}>
        {icon}
      </div>
      <div>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800,
          color: 'var(--primary-text)', lineHeight: 1, marginBottom: 3,
        }}>{value}</div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--primary-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </div>
      </div>
    </div>
  )
}

// ─── Feature card (Next for you) ─────────────────────────────────────────────
function HeroRecommCard({ title, matchPercent, masteryScore, topicId, reason, onClick }) {
  const [hover, setHover] = useState(false)
  const color = matchColor(matchPercent)
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
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15, color }}>{matchPercent}%</span>
        </div>
        <span style={{ fontSize: 10, color: 'var(--primary-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>match</span>
        {masteryScore > 0 && (
          <span style={{ fontSize: 10, fontWeight: 700, color: masteryColor }}>
            {masteryScore}% mastery
          </span>
        )}
      </div>
    </motion.button>
  )
}

// ─── Compact row card ─────────────────────────────────────────────────────────
function RowCard({ title, reason, topicId, tag, tagColor, onClick }) {
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

// ─── Mastery ring ─────────────────────────────────────────────────────────────
function MasteryRing({ percent = 0, label = 'Overall', size = 100 }) {
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

// ─── Topic progress row ───────────────────────────────────────────────────────
function TopicProgressRow({ name, mastery, status, onClick }) {
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

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ title, action, onAction }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--primary-text)', letterSpacing: '-0.01em' }}>
        {title}
      </h2>
      {action && (
        <button type="button" onClick={onAction} style={{
          background: 'none', border: 'none', color: '#818cf8', fontSize: 12,
          fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
        }}>
          {action} <IcoArrow />
        </button>
      )}
    </div>
  )
}

// ─── Main dashboard ───────────────────────────────────────────────────────────
export default function Home() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { user }  = useAuth()
  const userId    = useUserId()
  const { shouldShow, markDone } = useOnboarding()

  // Only show onboarding if not coming from a fresh auth redirect
  const fromAuth = location.state?.fromAuth
  const [showOnboarding, setShowOnboarding] = useState(() => shouldShow && !fromAuth)

  const [recommendations, setRecommendations] = useState([])
  const [progress,        setProgress]        = useState([])
  const [loading,         setLoading]         = useState(true)

  useEffect(() => {
    track(EVENTS.SKILL_MAP_OPENED)
    const minDelay = new Promise(r => setTimeout(r, 600))
    Promise.all([
      fetch(`/api/recommendations/${userId}`).then(r => { if (!r.ok) throw new Error(); return r.json() }),
      fetch(`/api/progress/${userId}`).then(r => { if (!r.ok) throw new Error(); return r.json() }),
      minDelay,
    ])
      .then(([recs, prog]) => {
        setRecommendations(Array.isArray(recs) ? recs : [])
        setProgress(Array.isArray(prog) ? prog : [])
        setLoading(false)
      })
      .catch(() => {
        setRecommendations([])
        setProgress([])
        setLoading(false)
      })
  }, [userId])

  const nextForYou    = recommendations.filter(r => r.recommendation_type === 'Next for you')
  const review        = recommendations.filter(r => r.recommendation_type === 'Review')
  const readyToMaster = recommendations.filter(r => r.recommendation_type === 'Ready to master')

  const stats = useMemo(() => {
    const mastered   = progress.filter(n => n.status === 'Mastered').length
    const inProgress = progress.filter(n => n.status === 'In progress').length
    const notStarted = progress.filter(n => n.status === 'Not started').length
    const attempted  = progress.filter(n => n.status !== 'Not started')
    const overallPct = attempted.length
      ? Math.round(attempted.reduce((s, n) => s + (n.mastery_score ?? 0), 0) / attempted.length)
      : 0
    return { mastered, inProgress, notStarted, overallPct, total: progress.length }
  }, [progress])

  const displayName = user?.name || 'Student'
  const goToCase    = (skillId) => { track(EVENTS.CASE_STARTED, { skill: skillId }); navigate('/learn/choose-case?skill=' + skillId) }
  const primaryRec  = nextForYou[0] ?? null

  const handleOnboardingDone = () => {
    markDone()
    setShowOnboarding(false)
  }

  return (
    <>
      <AnimatePresence>
        {showOnboarding && (
          <OnboardingFlow key="onboarding" onDone={handleOnboardingDone} />
        )}
      </AnimatePresence>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1100, margin: '0 auto' }}>

        {/* ── Hero: Progress summary + primary CTA ── */}
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-light)',
          borderRadius: 20, padding: '24px 28px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <h1 style={{
                margin: '0 0 6px', fontFamily: 'var(--font-display)',
                fontSize: 26, fontWeight: 800, color: 'var(--primary-text)', letterSpacing: '-0.03em',
              }}>
                {getGreeting()}, {displayName}
              </h1>
              <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--primary-text-muted)', lineHeight: 1.5 }}>
                {loading
                  ? 'Loading your study plan…'
                  : stats.overallPct > 0
                    ? `You've mastered ${stats.overallPct}% overall — keep building momentum.`
                    : 'Start a case and the AI will build your personalised study plan.'
                }
              </p>

              {!loading && primaryRec ? (
                <button
                  type="button"
                  onClick={() => goToCase(primaryRec.item_id)}
                  className="bw-hero-cta"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '12px 24px', borderRadius: 12,
                    background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                    border: 'none', color: '#fff',
                    fontSize: 14, fontWeight: 700, cursor: 'pointer',
                    boxShadow: '0 6px 20px rgba(99,102,241,0.4)',
                    transition: 'transform 0.15s, box-shadow 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(99,102,241,0.5)' }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(99,102,241,0.4)' }}
                >
                  Continue: {primaryRec.item_name} <IcoArrow />
                </button>
              ) : !loading ? (
                <button
                  type="button"
                  onClick={() => navigate('/learn/choose-case?skill=motion')}
                  className="bw-hero-cta"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '12px 24px', borderRadius: 12,
                    background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                    border: 'none', color: '#fff',
                    fontSize: 14, fontWeight: 700, cursor: 'pointer',
                    boxShadow: '0 6px 20px rgba(99,102,241,0.4)',
                    transition: 'transform 0.15s, box-shadow 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(99,102,241,0.5)' }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(99,102,241,0.4)' }}
                >
                  Start your first case <IcoArrow />
                </button>
              ) : null}
            </div>

            {/* Mastery ring */}
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              {loading
                ? <Skeleton height={110} borderRadius={55} style={{ width: 110 }} />
                : <MasteryRing percent={stats.overallPct} label="Overall mastery" size={110} />
              }
              {!loading && (
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {[
                    { color: 'var(--accent-success)', label: 'Mastered' },
                    { color: 'var(--accent-warning)', label: 'Learning' },
                    { color: 'var(--border-medium)',  label: 'New' },
                  ].map(({ color, label }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
                      <span style={{ fontSize: 10, color: 'var(--primary-text-muted)', fontWeight: 600 }}>{label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Stats strip ── */}
        {loading ? (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[0, 1, 2, 3].map(i => <Skeleton key={i} height={70} borderRadius={16} style={{ flex: '1 1 140px' }} delay={i * 0.1} />)}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <StatChip icon={<IcoFlame />} value={stats.mastered}    label="Mastered"    color="var(--accent-success)" />
            <StatChip icon={<IcoZap />}   value={stats.inProgress} label="In progress" color="#818cf8" />
            <StatChip icon={<IcoStar />}  value={stats.notStarted} label="To explore"  color="#f59e0b" />
            <StatChip icon={<IcoCheck />} value={`${stats.total}`} label="Total topics" color="#34d399" />
          </div>
        )}

        {/* ── Next for you ── */}
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-light)',
          borderRadius: 20, padding: '20px 20px 16px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        }}>
          <SectionHeader title="⚡ Next for you" action="See all" onAction={() => navigate('/learn/skill-map')} />
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[0, 1, 2].map(i => <Skeleton key={i} height={72} borderRadius={14} delay={i * 0.12} />)}
            </div>
          ) : nextForYou.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {nextForYou.map(t => (
                <HeroRecommCard
                  key={t.item_id}
                  title={t.item_name}
                  matchPercent={Math.round(t.match_score ?? 0)}
                  masteryScore={t.mastery_score ?? 0}
                  topicId={t.item_id}
                  reason={t.reason}
                  onClick={() => goToCase(t.item_id)}
                />
              ))}
            </div>
          ) : (
            <EmptyState message="Complete your first case and we'll personalise this section for you." cta="Explore the skill map" onCta={() => navigate('/learn/skill-map')} />
          )}
        </div>

        {/* ── Review + Ready to master ── */}
        {(review.length > 0 || readyToMaster.length > 0) && !loading && (
          <div id="home-review-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {review.length > 0 && (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 18, padding: '16px 16px 12px' }}>
                <SectionHeader title="🔁 Review" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {review.map(t => (
                    <RowCard key={t.item_id} title={t.item_name} reason={t.reason} topicId={t.item_id} tag="Review" tagColor="var(--accent-warning)" onClick={() => goToCase(t.item_id)} />
                  ))}
                </div>
              </div>
            )}
            {readyToMaster.length > 0 && (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 18, padding: '16px 16px 12px' }}>
                <SectionHeader title="🏆 Close to mastered" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {readyToMaster.map(t => (
                    <RowCard key={t.item_id} title={t.item_name} reason={t.reason} topicId={t.item_id} tag="Almost!" tagColor="var(--accent-success)" onClick={() => goToCase(t.item_id)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Topic progress (full-width) ── */}
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-light)',
          borderRadius: 20, padding: '20px 16px 12px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        }}>
          <SectionHeader title="Topic progress" action="Full map" onAction={() => navigate('/learn/skill-map')} />
          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={32} borderRadius={8} delay={i * 0.06} style={{ marginBottom: 4 }} />)}
            </div>
          ) : (
            <div id="home-topics-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
              {progress.map(n => (
                <TopicProgressRow
                  key={n.skill_id}
                  name={n.skill_name}
                  mastery={n.mastery_score ?? 0}
                  status={n.status}
                  onClick={() => goToCase(n.skill_id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Responsive overrides */}
        <style>{`
          @media (max-width: 640px) {
            #home-review-grid { grid-template-columns: 1fr !important; }
            #home-topics-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </div>
    </>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

function EmptyState({ message, cta, onCta }) {
  return (
    <div style={{ textAlign: 'center', padding: '28px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <EmptyIllustration type="no-recommendations" size={72} />
      <p style={{ fontSize: 14, color: 'var(--primary-text-muted)', margin: 0 }}>{message}</p>
      {cta && (
        <button type="button" onClick={onCta} style={{
          background: 'none', border: 'none', color: '#818cf8',
          fontWeight: 700, fontSize: 14, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          {cta} <IcoArrow />
        </button>
      )}
    </div>
  )
}

