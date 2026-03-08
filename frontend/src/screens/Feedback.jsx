import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import PhysicsLoader from '../components/PhysicsLoader'
import FeedbackCard from '../components/FeedbackCard'
import MasteryScore from '../components/MasteryScore'
import PostCard from '../components/PostCard'
import { ButtonPrimary, ButtonText } from '../components/ButtonPrimary'
import { getTopicById } from '../physicsTopics'
import { useUserId } from '../hooks/useAuth'
import { useForum } from '../hooks/useForum'

const SESSION_KEY = 'bw_feedback_state'

function useRemediationJob(jobId) {
  const [videoUrl, setVideoUrl] = useState(null)
  const [jobStatus, setJobStatus] = useState(jobId ? 'pending' : null)

  useEffect(() => {
    if (!jobId) return
    setJobStatus('pending')
    setVideoUrl(null)

    const MAX_MS = 130_000
    const INTERVAL = 3000
    let elapsed = 0

    const id = setInterval(async () => {
      elapsed += INTERVAL
      if (elapsed > MAX_MS) {
        clearInterval(id)
        setJobStatus('timeout')
        return
      }
      try {
        const r = await fetch(`/api/job/${jobId}`)
        if (r.status === 404) { clearInterval(id); setJobStatus('lost'); return }
        const data = await r.json()
        if (data.status === 'done' && data.result?.video_url) {
          clearInterval(id)
          setVideoUrl(data.result.video_url)
          setJobStatus('done')
        } else if (data.status === 'error') {
          clearInterval(id)
          setJobStatus('error')
        }
      } catch { clearInterval(id); setJobStatus('error') }
    }, INTERVAL)

    return () => clearInterval(id)
  }, [jobId])

  return { videoUrl, jobStatus }
}

function ScoreRing({ score, size = 140 }) {
  const [animated, setAnimated] = useState(0)
  const strokeWidth = 10
  const r = (size - strokeWidth * 2) / 2
  const circ = 2 * Math.PI * r
  const color = score >= 80 ? '#34d399' : score >= 50 ? '#fbbf24' : '#ef4444'

  useEffect(() => {
    const t = setTimeout(() => setAnimated(score), 150)
    return () => clearTimeout(t)
  }, [score])

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size}>
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="var(--border-light, rgba(255,255,255,0.08))" strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - Math.min(animated, 100) / 100)}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{
            transition: 'stroke-dashoffset 1.4s cubic-bezier(0.4,0,0.2,1)',
            filter: `drop-shadow(0 0 10px ${color}60)`,
          }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{
          fontFamily: 'var(--font-display)',
          fontSize: size * 0.28, fontWeight: 800, color,
          lineHeight: 1,
        }}>
          {score}%
        </span>
        <span style={{
          fontSize: 11, fontWeight: 600,
          color: 'var(--primary-text-muted)',
          marginTop: 2,
        }}>
          {score >= 80 ? 'Great job!' : score >= 50 ? 'Getting there' : 'Needs work'}
        </span>
      </div>
    </div>
  )
}

export default function Feedback() {
  const navigate = useNavigate()
  const location = useLocation()
  const userId = useUserId()

  const restoredState = (() => {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null') } catch { return null }
  })()
  const state = (location.state && Object.keys(location.state).length > 0)
    ? location.state
    : (restoredState || {})

  const { caseId, caseTitle = 'Practice case', skillId, evaluation, qaPairs = [] } = state

  useEffect(() => {
    if (location.state && Object.keys(location.state).length > 0) {
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(location.state)) } catch {}
    }
  }, [location.state])

  const topic = getTopicById(skillId)

  const score      = evaluation?.overall_score ?? Math.round((state.score || 0.5) * 100)
  const feedback   = evaluation?.summary_feedback ?? state.feedback ?? 'Good effort!'
  const gaps       = evaluation?.gaps ?? []
  const needsRem   = evaluation?.needs_remediation ?? score < 60
  const remJobId   = evaluation?.remediation_job_id ?? null
  const results    = evaluation?.results ?? []
  const delta      = evaluation?.delta ?? 0

  const { videoUrl, jobStatus } = useRemediationJob(remJobId)

  const { getPostsForCase, addPost, upvotePost, hasUpvoted } = useForum()
  const caseTips = getPostsForCase(caseId).slice(0, 3)
  const [showTipForm, setShowTipForm] = useState(false)
  const [tipText, setTipText] = useState('')

  const handleSubmitTip = () => {
    if (!tipText.trim() || !caseId) return
    addPost(
      `Tip: ${caseTitle}`,
      tipText.trim(),
      ['#peer-tip'],
      'Student',
      null,
      caseId,
    )
    setTipText('')
    setShowTipForm(false)
  }

  const [mastery, setMastery] = useState(null)
  useEffect(() => {
    if (!skillId) return
    fetch(`/api/progress/${userId}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          const node = data.find(n => n.skill_id === skillId)
          if (node) setMastery(node.mastery_score ?? 0)
        }
      })
      .catch(() => {})
  }, [skillId, userId])

  const correct = results.filter(r => r.correct).length
  const total   = results.length || qaPairs.length || 1

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 20px 80px' }}>

      {/* Page header */}
      <div style={{ marginBottom: 8 }}>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800,
          margin: '0 0 6px', letterSpacing: '-0.02em',
        }}>
          {topic?.name || 'Feedback'}
        </h1>
        <div style={{
          fontSize: 13, fontWeight: 700, color: 'var(--accent-main)',
          letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 2,
        }}>
          {caseTitle} — Session Review
        </div>
      </div>

      {/* Score hero */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-light)',
        borderRadius: 20, padding: '28px 32px',
        marginBottom: 24,
        display: 'flex', alignItems: 'center', gap: 28,
        flexWrap: 'wrap', justifyContent: 'center',
      }}>
        <ScoreRing score={score} size={130} />

        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ display: 'flex', gap: 20, marginBottom: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--primary-text-muted)', marginBottom: 2 }}>
                Correct
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: 'var(--accent-success, #34d399)' }}>
                {correct}/{total}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--primary-text-muted)', marginBottom: 2 }}>
                Mastery change
              </div>
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800,
                color: delta > 0 ? 'var(--accent-success, #34d399)' : delta < 0 ? '#ef4444' : 'var(--primary-text-muted)',
              }}>
                {delta > 0 ? '+' : ''}{delta}%
              </div>
            </div>
            {mastery != null && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--primary-text-muted)', marginBottom: 2 }}>
                  Current mastery
                </div>
                <div style={{
                  fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800,
                  color: mastery >= 80 ? '#34d399' : mastery >= 50 ? '#fbbf24' : '#818cf8',
                }}>
                  {mastery}%
                </div>
              </div>
            )}
          </div>

          {/* Mastery updated badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: delta > 0 ? 'rgba(52,211,153,0.1)' : delta < 0 ? 'rgba(239,68,68,0.1)' : 'rgba(129,140,248,0.1)',
            border: `1px solid ${delta > 0 ? 'rgba(52,211,153,0.25)' : delta < 0 ? 'rgba(239,68,68,0.25)' : 'rgba(129,140,248,0.25)'}`,
            borderRadius: 10, padding: '6px 14px',
          }}>
            <span style={{ fontSize: 14 }}>{delta > 0 ? '📈' : delta < 0 ? '📉' : '➡️'}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary-text)' }}>
              {delta > 0 ? 'Mastery improved!' : delta < 0 ? 'More practice needed' : 'Mastery unchanged'}
            </span>
          </div>
        </div>
      </div>

      {/* AI Feedback card */}
      <FeedbackCard feedback={feedback} />

      {/* Gaps */}
      {gaps.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary-text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Knowledge gaps identified
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {gaps.map((g, i) => (
              <span key={i} style={{
                background: 'rgba(239,68,68,0.1)', color: '#fca5a5',
                fontSize: 12, padding: '4px 12px', borderRadius: 99, fontWeight: 600,
                border: '1px solid rgba(239,68,68,0.2)',
              }}>
                {g}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Per-question breakdown */}
      {results.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14, color: 'var(--primary-text)' }}>Question breakdown</div>
          {qaPairs.map((qa, i) => {
            const r = results[i] || {}
            return (
              <div key={i} style={{
                background: r.correct ? 'rgba(52,211,153,0.04)' : 'rgba(239,68,68,0.04)',
                border: `1px solid ${r.correct ? 'rgba(52,211,153,0.15)' : 'rgba(239,68,68,0.15)'}`,
                borderLeft: `3px solid ${r.correct ? 'var(--accent-success)' : '#ef4444'}`,
                borderRadius: '0 12px 12px 0',
                padding: '14px 18px', marginBottom: 12,
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
                }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: r.correct ? 'var(--accent-success)' : '#ef4444',
                  }}>
                    {r.correct ? '✓ Correct' : '✗ Incorrect'}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--primary-text-muted)' }}>
                    Q{i + 1} of {qaPairs.length}
                  </span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--primary-text)', lineHeight: 1.5 }}>
                  {qa.question}
                </div>
                <div style={{ fontSize: 12, color: 'var(--primary-text-muted)', marginBottom: r.feedback ? 6 : 0 }}>
                  Your answer: <span style={{ color: 'var(--primary-text)' }}>{qa.student_answer || '—'}</span>
                </div>
                {r.feedback && (
                  <div style={{
                    fontSize: 12, color: 'var(--primary-text)', marginTop: 8,
                    background: r.correct ? 'rgba(52,211,153,0.06)' : 'rgba(129,140,248,0.06)',
                    borderRadius: 8, padding: '8px 12px',
                    borderLeft: `2px solid ${r.correct ? '#34d399' : '#818cf8'}`,
                  }}>
                    {r.feedback}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Mastery progress */}
      {mastery != null && (
        <div style={{ marginBottom: 24 }}>
          <MasteryScore
            label={topic?.name || 'Mastery'}
            percent={mastery}
            delta={delta}
            size="large"
          />
        </div>
      )}

      {/* Remediation animation */}
      {needsRem && remJobId && (
        <div style={{
          marginBottom: 24,
          background: 'var(--bg-card)', border: '1px solid var(--border-light)',
          borderRadius: 16, padding: '22px',
        }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>📹</span> Watch: Fix your gap
          </div>
          <div style={{ fontSize: 13, color: 'var(--primary-text-muted)', marginBottom: 14 }}>
            {evaluation?.remediation_concept
              ? `Focus on: "${evaluation.remediation_concept}"`
              : 'A targeted animation is being generated to address your gap.'}
          </div>

          <div style={{
            background: '#000', borderRadius: 12, overflow: 'hidden',
            aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {jobStatus === 'done' && videoUrl ? (
              <video controls autoPlay muted loop style={{ width: '100%', height: '100%', objectFit: 'contain' }}>
                <source src={videoUrl} type="video/mp4" />
              </video>
            ) : jobStatus === 'error' || jobStatus === 'timeout' || jobStatus === 'lost' ? (
              <p style={{ color: '#71717a', fontSize: 13, textAlign: 'center', padding: 20 }}>
                Animation unavailable. Try asking in the Chat tab.
              </p>
            ) : (
              <div style={{ textAlign: 'center' }}>
                <PhysicsLoader />
                <p style={{ color: '#71717a', fontSize: 13, marginTop: 12 }}>Generating targeted animation…</p>
              </div>
            )}
          </div>

          {evaluation?.animation_prompt && (
            <button
              onClick={() => navigate(`/chat?q=${encodeURIComponent(evaluation.animation_prompt)}`)}
              style={{
                marginTop: 12, background: 'none', border: '1px solid var(--border-light)',
                borderRadius: 8, padding: '7px 14px',
                color: 'var(--accent-main)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Open in AI chat →
            </button>
          )}
        </div>
      )}

      {/* Peer tips */}
      {caseId && (
        <div style={{ marginBottom: 24 }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 12,
          }}>
            <div style={{
              fontSize: 12, fontWeight: 700, color: 'var(--primary-text-muted)',
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              Peer tips for this case
            </div>
            <button
              type="button"
              onClick={() => setShowTipForm(v => !v)}
              style={{
                background: 'none', border: '1px solid var(--border-light)',
                borderRadius: 8, padding: '5px 12px',
                color: 'var(--accent-main)', fontSize: 12, fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {showTipForm ? 'Cancel' : '+ Leave a tip'}
            </button>
          </div>

          {showTipForm && (
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border-light)',
              borderRadius: 14, padding: 16, marginBottom: 12,
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <textarea
                value={tipText}
                onChange={e => setTipText(e.target.value)}
                placeholder="Share a short tip that helped you with this case..."
                maxLength={280}
                rows={2}
                style={{
                  padding: '10px 14px', borderRadius: 10,
                  border: '1px solid var(--border-medium)',
                  background: 'var(--primary-bg)', color: 'var(--primary-text)',
                  fontSize: 13, fontFamily: 'var(--font-body)',
                  resize: 'none', outline: 'none',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--primary-text-muted)' }}>{tipText.length}/280</span>
                <button
                  type="button"
                  onClick={handleSubmitTip}
                  disabled={tipText.trim().length < 5}
                  style={{
                    padding: '8px 18px', borderRadius: 10,
                    background: tipText.trim().length >= 5 ? 'var(--gradient-accent)' : 'var(--bg-card)',
                    color: tipText.trim().length >= 5 ? '#fff' : 'var(--primary-text-muted)',
                    border: '1px solid var(--border-light)',
                    fontSize: 13, fontWeight: 700, cursor: tipText.trim().length >= 5 ? 'pointer' : 'not-allowed',
                  }}
                >
                  Post tip
                </button>
              </div>
            </div>
          )}

          {caseTips.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {caseTips.map(tip => (
                <PostCard
                  key={tip.id}
                  post={tip}
                  onUpvote={upvotePost}
                  didUpvote={hasUpvoted(tip.id)}
                  variant="tip"
                />
              ))}
            </div>
          ) : (
            <div style={{
              textAlign: 'center', padding: '20px 0',
              fontSize: 13, color: 'var(--primary-text-muted)',
            }}>
              No tips yet — be the first to share one!
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <ButtonPrimary onClick={() => navigate('/learn/skill-map')}>
          Back to skill map
        </ButtonPrimary>
        {skillId && (
          <ButtonText onClick={() => navigate(`/learn/choose-case?skill=${skillId}`)}>
            Try another case →
          </ButtonText>
        )}
        {caseId && skillId && (
          <ButtonText onClick={() => navigate(`/learn/assess/${caseId}?skill=${skillId}`)}>
            Retry same case
          </ButtonText>
        )}
        <button
          onClick={() => { navigator.clipboard.writeText(feedback).catch(() => {}) }}
          style={{
            padding: '8px 14px', borderRadius: 8,
            background: 'none', border: '1px solid var(--border-light)',
            color: 'var(--primary-text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Copy feedback
        </button>
      </div>
    </div>
  )
}
