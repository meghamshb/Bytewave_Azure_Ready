import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { renderMathInText, containsLatex } from '../utils/renderMath'
import 'katex/dist/katex.min.css'

const DEMO_QUESTION = `A ball is thrown horizontally at 20 m/s from a cliff 45 m high. 
How long does it take to hit the ground? How far from the base does it land?`

function FeedbackResult({ text }) {
  const hasLatex = containsLatex(text)
  const html = useMemo(() => hasLatex ? renderMathInText(text) : null, [text, hasLatex])

  return (
    <div style={{
      marginTop: 20, padding: '20px 24px', borderRadius: 16,
      background: 'rgba(34,197,94,0.06)',
      border: '1px solid rgba(34,197,94,0.2)',
      animation: 'demo-fadein 0.4s ease',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', letterSpacing: '0.1em', marginBottom: 10 }}>
        AI FEEDBACK
      </div>
      {hasLatex ? (
        <div
          style={{ margin: 0, fontSize: 14, lineHeight: 1.75, color: 'var(--primary-text)' }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.75, color: 'var(--primary-text)', whiteSpace: 'pre-wrap' }}>
          {text}
        </p>
      )}
      <Link to="/auth" style={{
        display: 'inline-block', marginTop: 16,
        padding: '10px 20px', borderRadius: 8,
        background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff',
        fontSize: 13, fontWeight: 700, textDecoration: 'none',
        boxShadow: '0 3px 12px rgba(99,102,241,0.35)',
      }}>
        Sign up to continue →
      </Link>
    </div>
  )
}

export default function LiveDemo() {
  const [answer,  setAnswer]  = useState('')
  const [result,  setResult]  = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const submit = async () => {
    if (!answer.trim()) return
    setLoading(true); setError(null); setResult(null)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: `${DEMO_QUESTION}\n\nMy answer: ${answer}\n\nPlease give brief educational feedback on my answer — what I got right, where my understanding breaks down, and exactly what I should review next. Keep it under 150 words.` }
          ]
        }),
      })
      const data = await res.json()
      setResult(data.response || data.message || JSON.stringify(data))
    } catch {
      setError('Could not reach the AI — make sure the backend is running on port 8000.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      {/* Question card */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-light)',
        borderLeft: '3px solid #6366f1',
        borderRadius: 16, padding: '20px 24px', marginBottom: 20,
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#818cf8', letterSpacing: '0.1em', marginBottom: 10 }}>
          KINEMATICS · PROJECTILE MOTION
        </div>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: 'var(--primary-text)', fontWeight: 500 }}>
          {DEMO_QUESTION}
        </p>
      </div>

      <textarea
        value={answer}
        onChange={e => setAnswer(e.target.value)}
        placeholder="Type your answer here — show your working if you can..."
        rows={4}
        style={{
          width: '100%', boxSizing: 'border-box',
          padding: '14px 16px', borderRadius: 12,
          background: 'var(--bg-card)',
          border: `1px solid ${result ? 'rgba(34,197,94,0.4)' : 'var(--border-light)'}`,
          color: 'var(--primary-text)', fontSize: 14, lineHeight: 1.6,
          resize: 'vertical', outline: 'none',
          fontFamily: 'var(--font-body)',
          transition: 'border-color 0.2s',
        }}
      />

      <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'center' }}>
        <button
          onClick={submit}
          disabled={loading || !answer.trim()}
          style={{
            padding: '12px 28px', borderRadius: 10,
            background: loading ? 'rgba(99,102,241,0.4)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff', fontSize: 14, fontWeight: 700,
            border: 'none', cursor: loading || !answer.trim() ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 16px rgba(99,102,241,0.3)',
            transition: 'all 0.2s',
          }}
        >
          {loading ? 'Analysing…' : 'Get AI feedback →'}
        </button>
        {!result && !loading && (
          <span style={{ fontSize: 12, color: 'var(--primary-text-muted)' }}>No account needed</span>
        )}
      </div>

      {error && (
        <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: 13 }}>
          {error}
        </div>
      )}

      {result && <FeedbackResult text={result} />}

      <style>{`
        @keyframes demo-fadein { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
      `}</style>
    </div>
  )
}
