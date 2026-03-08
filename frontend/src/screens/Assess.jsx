import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ButtonPrimary } from '../components/ButtonPrimary'
import Skeleton from '../components/Skeleton'
import { getTopicById } from '../physicsTopics'
import { useUserId } from '../hooks/useAuth'
import { apiFetch } from '../utils/api'

function AssessSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {[200, 80, 140].map((h, i) => (
        <Skeleton key={i} height={h} borderRadius={12} style={{ width: '100%' }} />
      ))}
    </div>
  )
}

function MasteryRing({ value, size = 80 }) {
  const r = (size - 10) / 2
  const circ = 2 * Math.PI * r
  const color = value >= 80 ? '#34d399' : value >= 50 ? '#fbbf24' : value > 0 ? '#818cf8' : 'var(--primary-text-muted)'

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={5} />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={5}
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - Math.min(value, 100) / 100)}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{
          fontFamily: 'var(--font-display)', fontSize: size * 0.26, fontWeight: 800,
          color, lineHeight: 1,
        }}>
          {value > 0 ? `${value}%` : '—'}
        </span>
      </div>
    </div>
  )
}

function HistoryItem({ item, index }) {
  const color = item.correct ? 'var(--accent-success, #34d399)' : 'var(--accent-error, #ef4444)'
  return (
    <div style={{
      background: item.correct ? 'rgba(52,211,153,0.04)' : 'rgba(239,68,68,0.04)',
      border: `1px solid ${item.correct ? 'rgba(52,211,153,0.15)' : 'rgba(239,68,68,0.15)'}`,
      borderLeft: `3px solid ${color}`,
      borderRadius: '0 12px 12px 0',
      padding: '12px 16px', marginBottom: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {item.correct ? '✓ Correct' : '✗ Incorrect'}
        </span>
        <span style={{ fontSize: 10, color: 'var(--primary-text-muted)' }}>Q{index + 1}</span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary-text)', lineHeight: 1.5, marginBottom: 4 }}>
        {item.question}
      </div>
      <div style={{ fontSize: 12, color: 'var(--primary-text-muted)' }}>
        Your answer: <span style={{ color: 'var(--primary-text)' }}>{item.student_answer || '—'}</span>
      </div>
      {item.feedback && (
        <div style={{
          fontSize: 12, color: 'var(--primary-text)', marginTop: 6,
          background: 'rgba(129,140,248,0.06)', borderRadius: 8, padding: '6px 10px',
          borderLeft: '2px solid #818cf8',
        }}>
          {item.feedback}
        </div>
      )}
    </div>
  )
}

export default function Assess() {
  const { caseId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const skillId = searchParams.get('skill')

  useEffect(() => {
    if (!skillId) navigate('/learn/skill-map', { replace: true })
  }, [skillId, navigate])

  const topic = getTopicById(skillId)
  const studentId = useUserId()

  const [caseData, setCaseData] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mastery, setMastery] = useState(0)
  const [masteryBefore, setMasteryBefore] = useState(0)

  const [currentQuestion, setCurrentQuestion] = useState(null)
  const [questionNumber, setQuestionNumber] = useState(0)
  const [answer, setAnswer] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [lastResult, setLastResult] = useState(null)
  const [showingFeedback, setShowingFeedback] = useState(false)

  const [history, setHistory] = useState([])
  const [previousQuestions, setPreviousQuestions] = useState([])
  const [done, setDone] = useState(false)
  const [summary, setSummary] = useState(null)

  const feedbackTimerRef = useRef(null)

  useEffect(() => {
    setLoading(true)

    apiFetch(`/api/cases/${skillId}`)
      .then(r => r.json())
      .then(data => {
        const found = Array.isArray(data)
          ? data.find(c => c.id.toString() === caseId.toString())
          : null
        setCaseData(found || null)
        if (!found) { setLoading(false); return }

        return apiFetch('/api/learn/start-adaptive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ student_id: studentId, skill: skillId, case_id: caseId }),
        })
          .then(r => r.json())
          .then(d => {
            setSessionId(d.session_id)
            setCurrentQuestion(d.question)
            setQuestionNumber(d.question_number || 1)
            setMastery(d.mastery_before ?? 0)
            setMasteryBefore(d.mastery_before ?? 0)
            setLoading(false)
          })
      })
      .catch(() => setLoading(false))
  }, [caseId, skillId, studentId])

  const handleSubmitAnswer = useCallback(async () => {
    if (!currentQuestion || !answer) return
    setSubmitting(true)
    setLastResult(null)

    try {
      const r = await apiFetch('/api/learn/submit-one', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          session_id: sessionId,
          skill: skillId,
          case_id: caseId,
          question: currentQuestion.question,
          answer: currentQuestion.correct_option || '',
          misconception: currentQuestion.misconception || '',
          explanation: currentQuestion.explanation || '',
          student_answer: answer,
          previous_questions: previousQuestions,
          results_history: history,
          mastery_before: masteryBefore,
        }),
      })
      const data = await r.json()

      const optionText = currentQuestion.options?.[answer] || answer
      const resultItem = {
        question: currentQuestion.question,
        student_answer: `(${answer}) ${optionText}`,
        correct: data.correct,
        correct_option: data.correct_option || currentQuestion.correct_option,
        gap: data.gap || '',
        feedback: data.feedback || '',
      }
      setLastResult(resultItem)
      setMastery(data.mastery_now ?? mastery)
      setShowingFeedback(true)

      const newHistory = [...history, resultItem]
      setHistory(newHistory)
      setPreviousQuestions(prev => [...prev, currentQuestion.question])

      if (data.done) {
        feedbackTimerRef.current = setTimeout(() => {
          setShowingFeedback(false)
          setDone(true)
          setSummary(data.summary)
        }, 2500)
      } else {
        feedbackTimerRef.current = setTimeout(() => {
          setShowingFeedback(false)
          setCurrentQuestion(data.next_question)
          setQuestionNumber(data.question_number + 1)
          setAnswer('')
          setLastResult(null)
        }, 2200)
      }
    } catch (err) {
      console.error('Submit failed', err)
    } finally {
      setSubmitting(false)
    }
  }, [currentQuestion, answer, studentId, sessionId, skillId, caseId, previousQuestions, history, masteryBefore, mastery])

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
    }
  }, [])

  const handleFinish = () => {
    if (!summary) return
    navigate('/learn/feedback', {
      state: {
        caseId,
        caseTitle: caseData?.title || 'Practice case',
        skillId,
        evaluation: {
          overall_score: summary.overall_score,
          delta: summary.delta,
          results: summary.results,
          gaps: summary.gaps,
          summary_feedback: summary.summary_feedback,
          needs_remediation: summary.needs_remediation,
          remediation_concept: summary.remediation_concept,
          remediation_job_id: summary.remediation_job_id || null,
          remediation_prompt: summary.remediation_prompt || null,
        },
        qaPairs: summary.results.map(r => ({
          question: r.question,
          student_answer: r.student_answer,
          answer: '',
          misconception: '',
        })),
      },
    })
  }

  const correctCount = history.filter(h => h.correct).length

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 20px 80px' }}>

      {loading ? (
        <AssessSkeleton />
      ) : !caseData ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--primary-text-muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          Case not found
          <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: 'var(--accent-main)', fontWeight: 600, cursor: 'pointer', fontSize: 14, display: 'block', margin: '12px auto 0' }}>
            ← Go back
          </button>
        </div>
      ) : done ? (
        /* ── Session complete ── */
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
            <MasteryRing value={mastery} size={120} />
          </div>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800,
            margin: '0 0 4px', letterSpacing: '-0.02em',
          }}>
            {topic?.name || 'Practice'}
          </h1>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent-main)', marginBottom: 12 }}>
            {caseData?.title} — Session Complete
          </div>
          <p style={{ color: 'var(--primary-text-muted)', fontSize: 14, margin: '0 0 4px' }}>
            {correctCount}/{history.length} correct · Mastery: {masteryBefore}% → {mastery}%
          </p>
          {summary?.summary_feedback && (
            <p style={{ color: 'var(--primary-text-muted)', fontSize: 13, margin: '8px auto 0', maxWidth: 420, lineHeight: 1.6 }}>
              {summary.summary_feedback}
            </p>
          )}

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24, flexWrap: 'wrap' }}>
            <ButtonPrimary onClick={handleFinish}>
              View full feedback →
            </ButtonPrimary>
            <button
              onClick={() => navigate('/learn/skill-map')}
              style={{
                padding: '10px 20px', borderRadius: 10,
                background: 'none', border: '1px solid var(--border-light)',
                color: 'var(--primary-text-muted)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Back to skill map
            </button>
          </div>

          {/* Answer history */}
          {history.length > 0 && (
            <div style={{ textAlign: 'left', marginTop: 28 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary-text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Question history
              </div>
              {history.map((item, i) => (
                <HistoryItem key={i} item={item} index={i} />
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ── Active question ── */
        <>
          {/* Header with mastery ring */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 16, marginBottom: 20, flexWrap: 'wrap',
          }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <h1 style={{
                fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 800,
                margin: '0 0 4px', letterSpacing: '-0.02em',
              }}>
                {topic?.name || 'Practice'}
              </h1>
              <div style={{
                fontSize: 14, fontWeight: 600, color: 'var(--accent-main)', marginBottom: 4,
              }}>
                {caseData.title}
              </div>
              {caseData.description && (
                <p style={{ color: 'var(--primary-text-muted)', fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                  {caseData.description}
                </p>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <MasteryRing value={mastery} size={76} />
              <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--primary-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Mastery
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20,
            padding: '10px 16px', borderRadius: 12,
            background: 'var(--bg-card)', border: '1px solid var(--border-light)',
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Progress toward mastery
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-main)' }}>
                  {mastery}% / 80%
                </span>
              </div>
              <div style={{ height: 5, borderRadius: 99, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 99,
                  width: `${Math.min(mastery / 80 * 100, 100)}%`,
                  background: mastery >= 80
                    ? 'linear-gradient(90deg, #34d399, #6ee7b7)'
                    : 'linear-gradient(90deg, #6366f1, #818cf8)',
                  transition: 'width 0.8s ease',
                }} />
              </div>
            </div>
            <div style={{ textAlign: 'center', flexShrink: 0 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: 'var(--primary-text)' }}>
                Q{questionNumber}
              </div>
              <div style={{ fontSize: 9, color: 'var(--primary-text-muted)', fontWeight: 600 }}>
                {correctCount}/{history.length} correct
              </div>
            </div>
          </div>

          {/* Past answers (collapsed) */}
          {history.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              {history.map((item, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 12px', marginBottom: 4, borderRadius: 8,
                  background: item.correct ? 'rgba(52,211,153,0.06)' : 'rgba(239,68,68,0.06)',
                  border: `1px solid ${item.correct ? 'rgba(52,211,153,0.12)' : 'rgba(239,68,68,0.12)'}`,
                }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    color: item.correct ? '#34d399' : '#ef4444',
                  }}>
                    {item.correct ? '✓' : '✗'} Q{i + 1}
                  </span>
                  <span style={{
                    fontSize: 12, color: 'var(--primary-text-muted)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                  }}>
                    {item.question}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Current question */}
          {currentQuestion && (
            <div style={{
              background: 'var(--bg-card)',
              border: `1px solid ${
                lastResult
                  ? lastResult.correct ? 'var(--accent-success)' : 'var(--accent-error, #ef4444)'
                  : answer ? 'var(--accent-main)' : 'var(--border-light)'
              }`,
              borderRadius: 14, padding: '20px 22px', marginBottom: 16,
              transition: 'border-color 0.3s',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-main)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 8 }}>
                Question {questionNumber}
              </div>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 10, lineHeight: 1.6 }}>
                {currentQuestion.question}
              </div>

              {currentQuestion.hint && (
                <HintToggle hint={currentQuestion.hint} />
              )}

              {/* MCQ Options */}
              {currentQuestion.options && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {Object.entries(currentQuestion.options).map(([letter, text]) => {
                    const isSelected = answer === letter
                    const isSubmitted = !!lastResult
                    const isCorrect = lastResult?.correct_option === letter
                    const isWrong = isSubmitted && isSelected && !lastResult.correct

                    let borderColor = 'var(--border-light)'
                    let bg = 'var(--bg-card)'
                    if (isSubmitted && isCorrect) {
                      borderColor = 'var(--accent-success, #34d399)'
                      bg = 'rgba(52,211,153,0.08)'
                    } else if (isWrong) {
                      borderColor = 'var(--accent-error, #ef4444)'
                      bg = 'rgba(239,68,68,0.08)'
                    } else if (isSelected && !isSubmitted) {
                      borderColor = 'var(--accent-main, #6366f1)'
                      bg = 'rgba(99,102,241,0.08)'
                    }

                    return (
                      <button
                        key={letter}
                        type="button"
                        disabled={isSubmitted || submitting}
                        onClick={() => setAnswer(letter)}
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: 12,
                          padding: '12px 16px', borderRadius: 12, width: '100%',
                          border: `1.5px solid ${borderColor}`,
                          background: bg,
                          cursor: isSubmitted ? 'default' : 'pointer',
                          textAlign: 'left',
                          transition: 'border-color 0.2s, background 0.2s',
                          opacity: isSubmitted && !isCorrect && !isSelected ? 0.5 : 1,
                        }}
                      >
                        <span style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                          fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 800,
                          background: isSelected
                            ? (isSubmitted
                                ? (isWrong ? 'rgba(239,68,68,0.15)' : 'rgba(52,211,153,0.15)')
                                : 'rgba(99,102,241,0.15)')
                            : (isSubmitted && isCorrect ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.06)'),
                          color: isSelected
                            ? (isSubmitted
                                ? (isWrong ? '#ef4444' : '#34d399')
                                : 'var(--accent-main)')
                            : (isSubmitted && isCorrect ? '#34d399' : 'var(--primary-text-muted)'),
                          border: `1px solid ${
                            isSelected
                              ? (isSubmitted ? (isWrong ? '#ef4444' : '#34d399') : 'var(--accent-main)')
                              : (isSubmitted && isCorrect ? '#34d399' : 'transparent')
                          }`,
                        }}>
                          {isSubmitted && isCorrect ? '✓' : isWrong ? '✗' : letter}
                        </span>
                        <span style={{
                          fontSize: 14, color: 'var(--primary-text)',
                          lineHeight: 1.5, paddingTop: 3,
                        }}>
                          {text}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Inline feedback after submit */}
              {lastResult && (
                <div style={{
                  marginTop: 12, padding: '10px 14px', borderRadius: 10,
                  background: lastResult.correct ? 'rgba(52,211,153,0.08)' : 'rgba(239,68,68,0.08)',
                  border: `1px solid ${lastResult.correct ? 'rgba(52,211,153,0.2)' : 'rgba(239,68,68,0.2)'}`,
                  animation: 'feedbackSlideIn 0.3s ease',
                }}>
                  <div style={{
                    fontWeight: 700, fontSize: 14, marginBottom: 4,
                    color: lastResult.correct ? 'var(--accent-success)' : 'var(--accent-error, #ef4444)',
                  }}>
                    {lastResult.correct ? '✓ Correct!' : '✗ Incorrect'}
                  </div>
                  {lastResult.feedback && (
                    <div style={{ fontSize: 13, color: 'var(--primary-text)', lineHeight: 1.5 }}>
                      {lastResult.feedback}
                    </div>
                  )}
                  {showingFeedback && (
                    <div style={{ fontSize: 11, color: 'var(--primary-text-muted)', marginTop: 6 }}>
                      {done ? 'Wrapping up session…' : 'Next question loading…'}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Submit button */}
          {!lastResult && (
            <div style={{ marginTop: 4 }}>
              <ButtonPrimary
                onClick={handleSubmitAnswer}
                disabled={!answer || submitting}
              >
                {submitting ? 'Checking…' : 'Confirm →'}
              </ButtonPrimary>
              {!answer && (
                <p style={{ marginTop: 8, fontSize: 12, color: 'var(--primary-text-muted)' }}>
                  Select an option to continue
                </p>
              )}
            </div>
          )}
        </>
      )}

      <style>{`
        @keyframes feedbackSlideIn {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

function HintToggle({ hint }) {
  const [show, setShow] = useState(false)
  return (
    <>
      <button
        onClick={() => setShow(h => !h)}
        style={{
          background: 'none', border: '1px solid var(--border-light)', borderRadius: 8,
          padding: '5px 12px', color: 'var(--accent-main)', fontSize: 12, fontWeight: 600,
          cursor: 'pointer', marginBottom: show ? 10 : 14,
        }}
      >
        {show ? 'Hide hint' : 'Show hint'}
      </button>
      {show && (
        <div style={{
          background: 'rgba(99,102,241,0.07)', borderRadius: 8, padding: '10px 14px',
          fontSize: 13, color: 'var(--primary-text-muted)', marginBottom: 14,
          borderLeft: '3px solid var(--accent-main)',
        }}>
          {hint}
        </div>
      )}
    </>
  )
}
