import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import Skeleton from '../components/Skeleton'
import OnboardingFlow, { useOnboarding } from '../components/OnboardingFlow'
import { useAuth, useUserId } from '../hooks/useAuth'
import { track, EVENTS } from '../hooks/useAnalytics'
import { apiFetch } from '../utils/api'
import TopicAnimation from '../components/TopicAnimation'

import { IcoArrow } from '../components/dashboard/icons'
import MasteryRing from '../components/dashboard/MasteryRing'
import SectionHeader from '../components/dashboard/SectionHeader'
import EmptyState from '../components/dashboard/EmptyState'

function getGreeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

function RecommCard({ title, topicId, reason, matchPercent, masteryScore, attempts, onClick }) {
  const isNew = (attempts ?? 0) === 0
  const accentColor = isNew ? '#818cf8' : masteryScore >= 80 ? '#34d399' : masteryScore >= 50 ? '#fbbf24' : '#818cf8'

  return (
    <button type="button" onClick={onClick} className="bw-dash-card" style={{
      all: 'unset', boxSizing: 'border-box', cursor: 'pointer', width: '100%',
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '16px 20px', borderRadius: 16,
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
      transition: 'all 0.2s ease',
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
        background: `${accentColor}12`, border: `1px solid ${accentColor}25`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <TopicAnimation topicId={topicId} size={24} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {title}
        </p>
        {reason && <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.4 }}>{reason}</p>}
      </div>
      <span style={{
        fontSize: isNew ? 10 : 13, fontWeight: 700,
        color: accentColor, background: `${accentColor}15`,
        border: `1px solid ${accentColor}25`,
        padding: '4px 10px', borderRadius: 8, flexShrink: 0,
        fontFamily: 'var(--font-display)',
      }}>
        {isNew ? 'NEW' : `${matchPercent}%`}
      </span>
    </button>
  )
}

function MiniTopicRow({ name, mastery, status, onClick }) {
  const color = status === 'Mastered' ? '#34d399' : status === 'In progress' ? '#fbbf24' : '#4b5563'
  return (
    <button type="button" onClick={onClick} className="bw-dash-topic" style={{
      all: 'unset', boxSizing: 'border-box', cursor: 'pointer', width: '100%',
      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
      borderRadius: 10, transition: 'background 0.15s',
    }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0, boxShadow: status !== 'Not started' ? `0 0 8px ${color}` : 'none' }} />
      <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.75)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
      <div style={{ width: 64, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ height: '100%', width: `${mastery}%`, background: color, borderRadius: 99, transition: 'width 1s ease' }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: mastery > 0 ? color : 'rgba(255,255,255,0.25)', width: 30, textAlign: 'right', flexShrink: 0, fontFamily: 'var(--font-display)' }}>
        {mastery > 0 ? `${mastery}%` : '—'}
      </span>
    </button>
  )
}

export default function Home() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { user }  = useAuth()
  const userId    = useUserId()
  const { shouldShow, markDone } = useOnboarding()

  const fromAuth = location.state?.fromAuth
  const [showOnboarding, setShowOnboarding] = useState(() => shouldShow && !fromAuth)

  const [recommendations, setRecommendations] = useState([])
  const [progress,        setProgress]        = useState([])
  const [loading,         setLoading]         = useState(true)

  useEffect(() => {
    track(EVENTS.SKILL_MAP_OPENED)
    const minDelay = new Promise(r => setTimeout(r, 600))
    Promise.all([
      apiFetch(`/api/recommendations/${userId}`).then(r => { if (!r.ok) throw new Error(); return r.json() }),
      apiFetch(`/api/progress/${userId}`).then(r => { if (!r.ok) throw new Error(); return r.json() }),
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1100, margin: '0 auto' }}>

        {/* ── Hero ── */}
        <div style={{
          position: 'relative', overflow: 'hidden',
          borderRadius: 24, padding: '32px 32px 28px',
          background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(6,6,20,0.95) 50%, rgba(139,92,246,0.06) 100%)',
          border: '1px solid rgba(99,102,241,0.12)',
        }}>
          {/* Radial glow */}
          <div style={{
            position: 'absolute', top: -60, right: -40,
            width: 350, height: 350, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 65%)',
            pointerEvents: 'none',
          }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap', position: 'relative' }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 700, color: 'rgba(129,140,248,0.7)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                {getGreeting()}
              </p>
              <h1 style={{
                margin: '0 0 10px', fontFamily: 'var(--font-display)',
                fontSize: 28, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.15,
              }}>
                {displayName}
              </h1>
              <p style={{ margin: '0 0 24px', fontSize: 14, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
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
                    padding: '13px 28px', borderRadius: 12,
                    background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                    border: 'none', color: '#fff',
                    fontSize: 14, fontWeight: 700, cursor: 'pointer',
                    fontFamily: 'inherit',
                    boxShadow: '0 6px 24px rgba(99,102,241,0.45)',
                    transition: 'transform 0.15s, box-shadow 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(99,102,241,0.55)' }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 6px 24px rgba(99,102,241,0.45)' }}
                >
                  {(primaryRec.attempts ?? 0) > 0 ? 'Continue' : 'Start'}: {primaryRec.item_name} <IcoArrow />
                </button>
              ) : !loading ? (
                <button
                  type="button"
                  onClick={() => navigate('/learn/choose-case?skill=motion')}
                  className="bw-hero-cta"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '13px 28px', borderRadius: 12,
                    background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                    border: 'none', color: '#fff',
                    fontSize: 14, fontWeight: 700, cursor: 'pointer',
                    fontFamily: 'inherit',
                    boxShadow: '0 6px 24px rgba(99,102,241,0.45)',
                    transition: 'transform 0.15s, box-shadow 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(99,102,241,0.55)' }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 6px 24px rgba(99,102,241,0.45)' }}
                >
                  Start your first case <IcoArrow />
                </button>
              ) : null}
            </div>

            {/* Mastery ring */}
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              {loading
                ? <Skeleton height={120} borderRadius={60} style={{ width: 120 }} />
                : <MasteryRing percent={stats.overallPct} label="Overall mastery" size={120} />
              }
            </div>
          </div>
        </div>

        {/* ── Stats strip ── */}
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {[0,1,2,3].map(i => <Skeleton key={i} height={80} borderRadius={16} delay={i * 0.1} />)}
          </div>
        ) : (
          <div id="home-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {[
              { value: stats.mastered,    label: 'Mastered',    color: '#34d399', icon: '✓' },
              { value: stats.inProgress,  label: 'In Progress', color: '#fbbf24', icon: '⚡' },
              { value: stats.notStarted,  label: 'To Explore',  color: '#818cf8', icon: '★' },
              { value: stats.total,       label: 'Total Topics', color: '#a78bfa', icon: '◎' },
            ].map(({ value, label, color, icon }) => (
              <div key={label} style={{
                padding: '18px 20px', borderRadius: 16,
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', alignItems: 'center', gap: 14,
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: `${color}12`, border: `1px solid ${color}20`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, color,
                }}>
                  {icon}
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{value}</div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>{label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Two-column: Recommendations + Topic progress ── */}
        <div id="home-main-grid" style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 20, alignItems: 'start' }}>

          {/* Left: Next for you + Review */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Next for you */}
            <div style={{
              borderRadius: 20, padding: '20px 20px 16px',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <SectionHeader title="Next for you" action="Skill map" onAction={() => navigate('/learn/skill-map')} />
              {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[0,1,2].map(i => <Skeleton key={i} height={68} borderRadius={14} delay={i * 0.12} />)}
                </div>
              ) : nextForYou.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {nextForYou.map(t => (
                    <RecommCard
                      key={t.item_id}
                      title={t.item_name}
                      topicId={t.item_id}
                      matchPercent={Math.round(t.match_score ?? 0)}
                      masteryScore={t.mastery_score ?? 0}
                      attempts={t.attempts ?? 0}
                      reason={t.reason}
                      onClick={() => goToCase(t.item_id)}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState message="Complete your first case and we'll personalise this section for you." cta="Explore the skill map" onCta={() => navigate('/learn/skill-map')} />
              )}
            </div>

            {/* Review + Close to mastered */}
            {(review.length > 0 || readyToMaster.length > 0) && !loading && (
              <div id="home-review-grid" style={{ display: 'grid', gridTemplateColumns: review.length > 0 && readyToMaster.length > 0 ? '1fr 1fr' : '1fr', gap: 12 }}>
                {review.length > 0 && (
                  <div style={{
                    borderRadius: 18, padding: '16px 16px 12px',
                    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    <SectionHeader title="Review" />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {review.map(t => (
                        <RecommCard
                          key={t.item_id}
                          title={t.item_name}
                          topicId={t.item_id}
                          matchPercent={0}
                          masteryScore={0}
                          attempts={1}
                          reason={t.reason}
                          onClick={() => goToCase(t.item_id)}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {readyToMaster.length > 0 && (
                  <div style={{
                    borderRadius: 18, padding: '16px 16px 12px',
                    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    <SectionHeader title="Close to mastered" />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {readyToMaster.map(t => (
                        <RecommCard
                          key={t.item_id}
                          title={t.item_name}
                          topicId={t.item_id}
                          matchPercent={0}
                          masteryScore={0}
                          attempts={1}
                          reason={t.reason}
                          onClick={() => goToCase(t.item_id)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: Topic progress sidebar */}
          <div style={{
            position: 'sticky', top: 76,
            borderRadius: 20, padding: '20px 16px 16px',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <SectionHeader title="All topics" action="Full map" onAction={() => navigate('/learn/skill-map')} />
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={36} borderRadius={8} delay={i * 0.06} />)}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {progress.map(n => (
                  <MiniTopicRow
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
        </div>

        <style>{`
          .bw-dash-card:hover { background: rgba(99,102,241,0.06) !important; border-color: rgba(99,102,241,0.2) !important; }
          .bw-dash-topic:hover { background: rgba(255,255,255,0.04) !important; }
          @media (max-width: 768px) {
            #home-main-grid { grid-template-columns: 1fr !important; }
            #home-stats-grid { grid-template-columns: 1fr 1fr !important; }
          }
          @media (max-width: 480px) {
            #home-stats-grid { grid-template-columns: 1fr !important; }
            #home-review-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </div>
    </>
  )
}
