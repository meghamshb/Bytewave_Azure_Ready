import { useState, useEffect, useRef, useMemo } from 'react'
import { renderMathInText } from '../utils/renderMath'
import 'katex/dist/katex.min.css'

const DEMO_PROMPT = `Explain how an Atwood machine works — show the forces on both masses and derive the acceleration.`

const AI_FEEDBACK = `An Atwood machine consists of two masses $m_1$ and $m_2$ connected by a string over a frictionless pulley.\n\nFor each mass, applying Newton's second law:\n$$m_1 g - T = m_1 a \\qquad T - m_2 g = m_2 a$$\n\nAdding both equations eliminates $T$:\n$$a = \\frac{(m_1 - m_2)\\,g}{m_1 + m_2}$$\n\nThe tension in the string is:\n$$T = \\frac{2\\,m_1 m_2\\,g}{m_1 + m_2}$$\n\nNotice: if $m_1 = m_2$, acceleration is zero and the system is in equilibrium. The heavier side always accelerates downward.`

function useTypewriter(text, speed, active) {
  const [pos, setPos] = useState(0)
  const done = pos >= text.length

  useEffect(() => {
    if (!active || done) return
    const id = setInterval(() => setPos(p => Math.min(p + 1, text.length)), speed)
    return () => clearInterval(id)
  }, [active, done, speed, text.length])

  return { text: text.slice(0, pos), done }
}

export default function LiveDemo() {
  const [phase, setPhase] = useState(0)
  const ref = useRef(null)
  const feedbackHtml = useMemo(() => renderMathInText(AI_FEEDBACK), [])

  const prompt = useTypewriter(DEMO_PROMPT, 22, phase >= 1)

  useEffect(() => {
    if (prompt.done && phase === 1) setTimeout(() => setPhase(2), 400)
  }, [prompt.done, phase])

  useEffect(() => {
    if (phase === 2) setTimeout(() => setPhase(3), 300)
  }, [phase])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting && phase === 0) setPhase(1) },
      { threshold: 0.4 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [phase])

  return (
    <div ref={ref} style={{ maxWidth: 720, margin: '0 auto' }}>

      {/* Chat-like container */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-light)',
        borderRadius: 20, overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
      }}>

        {/* Fake toolbar */}
        <div style={{
          padding: '10px 18px', borderBottom: '1px solid var(--border-light)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#eab308' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e' }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary-text-muted)', letterSpacing: '0.02em' }}>
            Byte Wave — AI Physics Tutor
          </span>
        </div>

        <div style={{ padding: '24px 24px 28px' }}>

          {/* User message bubble */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
            <div style={{
              maxWidth: '85%', padding: '14px 18px', borderRadius: '16px 16px 4px 16px',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff', fontSize: 14, lineHeight: 1.6, minHeight: 20,
            }}>
              {phase >= 1 ? prompt.text : '\u00A0'}
              {phase === 1 && !prompt.done && (
                <span style={{
                  display: 'inline-block', width: 2, height: 15,
                  background: 'rgba(255,255,255,0.7)', marginLeft: 1,
                  verticalAlign: 'text-bottom', animation: 'blink 0.7s step-end infinite',
                }} />
              )}
            </div>
          </div>

          {/* AI response */}
          {phase >= 2 && (
            <div style={{
              display: 'flex', gap: 12, animation: 'demo-fadein 0.5s ease',
            }}>
              {/* AI avatar */}
              <div style={{
                width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 700, color: '#fff',
              }}>
                AI
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Text feedback */}
                <div style={{
                  padding: '16px 20px', borderRadius: '4px 16px 16px 16px',
                  background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)',
                  marginBottom: 16,
                }}>
                  <div
                    style={{ margin: 0, fontSize: 14, lineHeight: 1.8, color: 'var(--primary-text)' }}
                    dangerouslySetInnerHTML={{ __html: feedbackHtml }}
                  />
                </div>

                {/* Animation video */}
                <div style={{
                  borderRadius: 14, overflow: 'hidden',
                  border: '1px solid var(--border-light)',
                  animation: 'demo-fadein 0.4s ease 0.3s both',
                }}>
                  <div style={{
                    padding: '8px 14px', background: 'rgba(99,102,241,0.06)',
                    borderBottom: '1px solid var(--border-light)',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <span style={{ fontSize: 14 }}>▶</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#818cf8', letterSpacing: '0.08em' }}>
                      GENERATED ANIMATION
                    </span>
                  </div>
                  <video
                    src="/demo-animation.mp4"
                    autoPlay muted loop playsInline
                    style={{ width: '100%', display: 'block', background: '#000' }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Typing indicator while waiting */}
          {phase === 2 && (
            <div style={{
              display: 'flex', gap: 12, marginTop: 16,
              animation: 'demo-fadein 0.3s ease',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 700, color: '#fff',
              }}>
                AI
              </div>
              <div style={{
                padding: '12px 18px', borderRadius: '4px 16px 16px 16px',
                background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)',
                display: 'flex', gap: 4, alignItems: 'center',
              }}>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{
                    width: 6, height: 6, borderRadius: '50%', background: '#22c55e',
                    opacity: 0.4, animation: `dot-pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                  }} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Caption after demo completes */}
      {phase >= 3 && (
        <p style={{
          marginTop: 20, textAlign: 'center', fontSize: 13,
          color: 'var(--primary-text-muted)', fontStyle: 'italic',
          animation: 'demo-fadein 0.5s ease 0.3s both',
        }}>
          AI feedback + generated animations for every physics topic.
        </p>
      )}

      <style>{`
        @keyframes demo-fadein { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes blink { 50% { opacity: 0; } }
        @keyframes dot-pulse { 0%, 80%, 100% { opacity: 0.3; } 40% { opacity: 1; } }
      `}</style>
    </div>
  )
}
