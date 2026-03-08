/**
 * LandingReveal
 *
 * All the below-fold marketing sections of the landing page — extracted so
 * they can be rendered in two places:
 *   1. Directly in the Landing page (normal scroll, users who don't hold)
 *   2. Inside HeroDashboard (after the 800ms hold completes) — the marketing
 *      story plays first, then the live study dashboard follows below it.
 */

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import ScrollReveal from '../components/ScrollReveal'
import LiveDemo from '../components/LiveDemo'
import TeamSection from '../components/TeamSection'

import WaitlistSection from '../components/WaitlistSection'
import { apiFetch } from '../utils/api'

const S = {
  section: { padding: '80px 24px', maxWidth: 1100, margin: '0 auto' },
  sectionTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 32, fontWeight: 700,
    textAlign: 'center', margin: '0 0 12px',
    color: 'var(--primary-text)',
  },
  sectionSub: {
    textAlign: 'center', margin: '0 0 48px',
    fontSize: 14, fontStyle: 'italic',
    color: 'var(--primary-text-muted)',
    fontFamily: 'var(--font-formula)',
  },
}

export default function LandingReveal() {
  const [communityStats, setCommunityStats] = useState(null)

  useEffect(() => {
    apiFetch('/api/forum/posts')
      .then(r => r.ok ? r.json() : [])
      .then(posts => {
        if (!Array.isArray(posts)) return
        const totalPosts = posts.length
        const totalReplies = posts.reduce((s, p) => s + (p.replies?.length ?? 0), 0)
        setCommunityStats({ posts: totalPosts, discussions: totalPosts + totalReplies })
      })
      .catch(() => {})
  }, [])

  return (
    <>
      {/* ── Problem → Solution strip ── */}
      <div className="prob-sol-grid" style={{
        maxWidth: 980, margin: '0 auto',
        padding: '0 24px 72px',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 0,
      }}>
        <div style={{ padding: '36px 40px 36px 0', borderRight: '1px solid var(--border-light)' }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', color: '#ef4444', textTransform: 'uppercase', marginBottom: 18 }}>
            The problem
          </div>
          {[
            'Students re-read textbooks without knowing what they don\'t know.',
            'Generic YouTube videos give no feedback on your specific mistakes.',
            'There\'s no way to know what to practice next — so students wing it.',
          ].map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
              <svg width={16} height={16} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
                <circle cx={8} cy={8} r={7} fill="rgba(239,68,68,0.12)" stroke="rgba(239,68,68,0.35)" strokeWidth={1.2}/>
                <path d="M5 8h6M8 5v6" stroke="#ef4444" strokeWidth={1.4} strokeLinecap="round" transform="rotate(45 8 8)"/>
              </svg>
              <span style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--primary-text-muted)' }}>{t}</span>
            </div>
          ))}
        </div>

        <div style={{ padding: '36px 0 36px 40px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', color: '#22c55e', textTransform: 'uppercase', marginBottom: 18 }}>
            Our solution
          </div>
          {[
            'Real physics cases that force you to apply knowledge, not just recall it.',
            'AI analyzes every answer and pinpoints your exact gap — instantly.',
            'A Netflix-like skill map updates after each case — "Next for you" is always clear.',
          ].map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
              <svg width={16} height={16} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
                <circle cx={8} cy={8} r={7} fill="rgba(34,197,94,0.12)" stroke="rgba(34,197,94,0.35)" strokeWidth={1.2}/>
                <path d="M5 8.5l2 2 4-4" stroke="#22c55e" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--primary-text-muted)' }}>{t}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Beta traction strip ── */}
      <div style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--border-light)', borderBottom: '1px solid var(--border-light)' }}>
        <div className="stats-grid" style={{
          maxWidth: 900, margin: '0 auto', padding: '36px 24px',
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
        }}>
          {[
            { num: '30+',  label: 'Practice cases',    sub: 'across all physics topics',              color: '#818cf8' },
            { num: '10',   label: 'Physics topics',    sub: 'covering the full syllabus',              color: '#22c55e' },
            { num: '<2s',  label: 'AI feedback',       sub: 'instant analysis per question',           color: '#a78bfa' },
          ].map(({ num, label, sub, color }) => (
            <div key={label} style={{ textAlign: 'center', padding: '8px 16px' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(32px, 4.5vw, 50px)', fontWeight: 800, lineHeight: 1, color, marginBottom: 6 }}>{num}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--primary-text)', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 12, color: 'var(--primary-text-muted)' }}>{sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Product preview ── */}
      <ScrollReveal>
        <div style={{ maxWidth: 880, margin: '0 auto', padding: '72px 24px 0' }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 24, overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.18)' }}>
            <div style={{ background: 'var(--primary-bg)', borderBottom: '1px solid var(--border-light)', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {['#ef4444','#f59e0b','#22c55e'].map(c => (
                  <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c, opacity: 0.8 }} />
                ))}
              </div>
              <div style={{ flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 6, padding: '4px 12px', fontSize: 11, color: 'var(--primary-text-muted)', maxWidth: 260 }}>
                bytewave.app/dashboard
              </div>
            </div>
            <div style={{ padding: '28px 32px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', color: 'var(--primary-text-muted)', textTransform: 'uppercase', marginBottom: 16 }}>Mastery progress</div>
                {[
                  { label: 'Kinematics',     pct: 72, color: '#6366f1' },
                  { label: 'Newton\'s Laws', pct: 45, color: '#8b5cf6' },
                  { label: 'Energy & Work',  pct: 88, color: '#22c55e' },
                  { label: 'Waves & Sound',  pct: 30, color: '#3b82f6' },
                  { label: 'Thermodynamics', pct: 18, color: '#f59e0b' },
                ].map(({ label, pct, color }) => (
                  <div key={label} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                      <span style={{ color: 'var(--primary-text)', fontWeight: 600 }}>{label}</span>
                      <span style={{ color, fontWeight: 700 }}>{pct}%</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--border-light)', borderRadius: 100, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${color}aa, ${color})`, borderRadius: 100 }} />
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', color: 'var(--primary-text-muted)', textTransform: 'uppercase', marginBottom: 16 }}>Recommended for you</div>
                {[
                  { title: 'Velocity from a position graph',  match: 91, tag: 'Next for you',    tagColor: '#6366f1' },
                  { title: 'Newton\'s 3rd law — collision',   match: 78, tag: 'Review',          tagColor: '#f59e0b' },
                  { title: 'Kinetic energy + ramp problem',   match: 95, tag: 'Ready to master', tagColor: '#22c55e' },
                ].map(({ title, match, tag, tagColor }) => (
                  <div key={title} style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--primary-bg)', border: '1px solid var(--border-light)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: `${tagColor}18`, border: `1px solid ${tagColor}40`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: tagColor }}>{match}%</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: tagColor, marginTop: 2 }}>{tag}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <p style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'var(--primary-text-muted)', fontStyle: 'italic' }}>
            Your dashboard after completing a few cases — mastery scores update in real time.
          </p>
        </div>
      </ScrollReveal>

      {/* ── See it in action (demo showcase) ── */}
      <ScrollReveal>
        <section style={{ ...S.section, scrollMarginTop: 70 }} id="live-demo">
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 100, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', marginBottom: 20 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block', animation: 'pulse-dot 1.8s ease-in-out infinite' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', letterSpacing: '0.09em' }}>SEE IT IN ACTION</span>
          </div>
          <h2 style={S.sectionTitle}>How a student learns with Byte Wave</h2>
          <p style={S.sectionSub}>Ask any physics question — get AI feedback with formulas and a generated animation, instantly.</p>
          <LiveDemo />
        </section>
      </ScrollReveal>

      {/* ── How it works ── */}
      <ScrollReveal>
        <section style={{ ...S.section, scrollMarginTop: 70 }} id="how-it-works">
          <h2 style={S.sectionTitle}>How it works</h2>
          <p style={S.sectionSub}>Four steps from zero to mastery</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 0, maxWidth: 960, margin: '0 auto', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 36, left: '12.5%', right: '12.5%', height: 2, background: 'linear-gradient(to right, transparent, rgba(99,102,241,0.3) 20%, rgba(99,102,241,0.3) 80%, transparent)', pointerEvents: 'none' }} />
            {[
              { n: '01', title: 'Open the skill map',          desc: 'See all 10 physics topics as a constellation. Mastered nodes glow — gaps are obvious at a glance.',                                            icon: <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx={12} cy={12} r={3}/><circle cx={12} cy={12} r={9} strokeDasharray="3 2"/><line x1={12} y1={3} x2={12} y2={6}/><line x1={12} y1={18} x2={12} y2={21}/><line x1={3} y1={12} x2={6} y2={12}/><line x1={18} y1={12} x2={21} y2={12}/></svg> },
              { n: '02', title: 'Pick a case',                 desc: 'Each topic has multiple real-world scenarios — ramps, graphs, collisions. Choose one that interests you.',                                      icon: <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg> },
              { n: '03', title: 'Answer & get AI feedback',    desc: 'Submit your answer. The AI finds exactly where your thinking broke down and tells you what to review.',                                           icon: <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg> },
              { n: '04', title: 'Track your mastery',          desc: 'Your dashboard updates with "Next for you", "Review", and "Ready to master" rows — like Netflix for physics.',                                   icon: <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x={3} y={13} width={4} height={8} rx={1}/><rect x={10} y={9} width={4} height={12} rx={1}/><rect x={17} y={5} width={4} height={16} rx={1}/></svg> },
            ].map(({ n, title, desc, icon }) => (
              <div key={n} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '0 20px' }}>
                <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--bg-card)', border: '2px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', marginBottom: 20, position: 'relative', zIndex: 1, boxShadow: '0 0 0 6px var(--primary-bg)' }}>
                  <span style={{ color: 'var(--accent-main)' }}>{icon}</span>
                  <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--primary-text-muted)', marginTop: 2 }}>{n}</span>
                </div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, margin: '0 0 8px', color: 'var(--primary-text)' }}>{title}</h3>
                <p style={{ fontSize: 13, lineHeight: 1.65, color: 'var(--primary-text-muted)', margin: 0 }}>{desc}</p>
              </div>
            ))}
          </div>
        </section>
      </ScrollReveal>

      {/* ── Why Byte Wave? differentiation strip ── */}
      <ScrollReveal>
        <div style={{ maxWidth: 980, margin: '0 auto', padding: '0 24px 80px' }}>
          <h2 style={{ ...S.sectionTitle, marginBottom: 8 }}>Why Byte Wave?</h2>
          <p style={{ ...S.sectionSub, marginBottom: 40 }}>We're not another video library or flashcard app.</p>
          <div className="diff-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
            {[
              { vs: 'vs Textbooks',            color: '#ef4444', them: 'Read → forget → re-read.',                                                       us: 'Apply → get AI feedback → remember. Active retrieval beats passive reading every time.',         icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg> },
              { vs: 'vs YouTube / Khan Academy', color: '#f59e0b', them: 'Watch someone else solve it. No way to know if you actually got it.',          us: 'You solve it. AI watches your reasoning and flags exactly where the logic breaks.',              icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x={1} y={5} width={15} height={14} rx={2} ry={2}/></svg> },
              { vs: 'vs Generic AI chatbots',  color: '#3b82f6', them: 'Ask a question, get an answer. You still don\'t know what you don\'t know.',  us: 'Structured cases + gap analysis + personalized "next step" — not just a chatbot.',               icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg> },
            ].map(({ vs, color, them, us, icon }) => (
              <div key={vs} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderTop: `3px solid ${color}`, borderRadius: 16, padding: '24px 22px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <span style={{ color }}>{icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color, letterSpacing: '0.03em' }}>{vs}</span>
                </div>
                <div style={{ padding: '10px 12px', borderRadius: 8, background: `${color}0d`, border: `1px solid ${color}22`, marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: '0.08em', marginBottom: 4 }}>THEM</div>
                  <p style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--primary-text-muted)', margin: 0 }}>{them}</p>
                </div>
                <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.14)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#818cf8', letterSpacing: '0.08em', marginBottom: 4 }}>BYTE WAVE</div>
                  <p style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--primary-text-muted)', margin: 0 }}>{us}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </ScrollReveal>

      {/* ── Community teaser ── */}
      <ScrollReveal>
        <section style={S.section}>
          <h2 style={S.sectionTitle}>Join the community</h2>
          <p style={S.sectionSub}>Students helping students — discuss cases, share insights, ask questions</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
            {[
              { init: 'AK', name: 'Arjun K.',    topic: 'Kinematics',      color: '#6366f1', text: 'I kept confusing velocity and acceleration on position–time graphs. The slope trick finally clicked — the slope of x(t) gives v, and slope of v(t) gives a. Changed everything for me.' },
              { init: 'SL', name: 'Sophia L.',   topic: 'Newton\'s Laws',  color: '#8b5cf6', text: 'Why does the block not move even though I applied a force? Friction! The AI feedback showed me I wasn\'t accounting for static friction before kinetic. Such a clear explanation.' },
              { init: 'MR', name: 'Marcus R.',   topic: 'Energy & Work',   color: '#3b82f6', text: 'The ramp + block case was tricky — I forgot that work done by normal force is zero (perpendicular to motion). The AI caught that gap immediately and sent me to the right review case.' },
            ].map(({ init, name, topic, text, color }) => (
              <div key={name} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--primary-text-muted)', margin: 0, flex: 1, fontStyle: 'italic' }}>"{text}"</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: `${color}22`, border: `2px solid ${color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color, flexShrink: 0 }}>{init}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary-text)' }}>{name}</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color, background: `${color}18`, display: 'inline-block', padding: '2px 8px', borderRadius: 100, marginTop: 2 }}>{topic}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {communityStats && (
            <div style={{
              display: 'flex', justifyContent: 'center', gap: 24, marginTop: 28,
              flexWrap: 'wrap',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block', animation: 'pulse-dot 1.8s ease-in-out infinite' }} />
                <span style={{ fontSize: 13, color: 'var(--primary-text-muted)' }}>
                  <strong style={{ color: 'var(--accent-main)', fontWeight: 800 }}>{communityStats.discussions}</strong> discussions and counting
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--primary-text-muted)' }}>
                  <strong style={{ color: 'var(--accent-main)', fontWeight: 800 }}>{communityStats.posts}</strong> topics posted
                </span>
              </div>
            </div>
          )}
          <div style={{ textAlign: 'center', marginTop: communityStats ? 16 : 32 }}>
            <Link to="/forum" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 24px', borderRadius: 10, background: 'var(--bg-card)', border: '1px solid var(--border-light)', color: 'var(--primary-text-muted)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
              Browse community discussions →
            </Link>
          </div>
        </section>
      </ScrollReveal>

      {/* ── Team / builders section ── */}
      <ScrollReveal>
        <TeamSection />
      </ScrollReveal>

      {/* ── Pricing ── */}
      <ScrollReveal>
        <section style={S.section}>
          <h2 style={S.sectionTitle}>Simple pricing</h2>
          <p style={S.sectionSub}>Free during beta. Launching with a paid plan when we graduate.</p>
          <div className="pricing-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, maxWidth: 700, margin: '0 auto' }}>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 20, padding: '32px 28px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary-text-muted)', letterSpacing: '0.08em', marginBottom: 8 }}>BETA · FREE</div>
              <div style={{ fontSize: 48, fontWeight: 800, color: 'var(--primary-text)', lineHeight: 1, marginBottom: 6 }}>$0</div>
              <div style={{ fontSize: 13, color: 'var(--primary-text-muted)', marginBottom: 24 }}>Everything. Forever, while in beta.</div>
              {['All 10 physics topics', 'Unlimited AI gap analysis', 'Skill map & mastery tracking', 'Community access', 'AI animation chat'].map(f => (
                <div key={f} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                  <svg width={15} height={15} viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="7.5" r="7" fill="rgba(34,197,94,0.15)" stroke="rgba(34,197,94,0.4)" strokeWidth="1"/><path d="M4.5 7.5l2 2 4-4" stroke="#22c55e" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <span style={{ fontSize: 13, color: 'var(--primary-text)' }}>{f}</span>
                </div>
              ))}
              <div style={{ marginTop: 24, padding: '12px', borderRadius: 10, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', textAlign: 'center', fontSize: 13, fontWeight: 600, color: '#22c55e' }}>
                Available now
              </div>
            </div>
            <div style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.08))', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 20, padding: '32px 28px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 16, right: 16, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 100, letterSpacing: '0.06em' }}>COMING SOON</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#818cf8', letterSpacing: '0.08em', marginBottom: 8 }}>PRO</div>
              <div style={{ fontSize: 48, fontWeight: 800, color: 'var(--primary-text)', lineHeight: 1, marginBottom: 6 }}>$12<span style={{ fontSize: 16, fontWeight: 400, color: 'var(--primary-text-muted)' }}>/mo</span></div>
              <div style={{ fontSize: 13, color: 'var(--primary-text-muted)', marginBottom: 24 }}>Launching Sept 2026 · Lock in beta pricing now.</div>
              {['Everything in Free', 'Priority AI response', 'Exam prep mode', 'Parent progress reports', 'Direct tutor sessions (soon)'].map(f => (
                <div key={f} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                  <svg width={15} height={15} viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="7.5" r="7" fill="rgba(99,102,241,0.15)" stroke="rgba(99,102,241,0.35)" strokeWidth="1"/><path d="M4.5 7.5l2 2 4-4" stroke="#818cf8" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <span style={{ fontSize: 13, color: 'var(--primary-text)' }}>{f}</span>
                </div>
              ))}
              <div style={{ display: 'block', textAlign: 'center', marginTop: 24, padding: '12px', borderRadius: 10, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', color: '#818cf8', fontSize: 14, fontWeight: 700 }}>Get notified at launch</div>
            </div>
          </div>
          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'var(--primary-text-muted)' }}>
            🔒 We never sell student data. Student work stays private.
          </p>
        </section>
      </ScrollReveal>

      {/* ── Waitlist ── */}
      <ScrollReveal>
        <section style={{ padding: '80px 24px 100px', background: 'linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(139,92,246,0.04) 100%)', borderTop: '1px solid rgba(99,102,241,0.15)', textAlign: 'center' }}>
          <WaitlistSection />
        </section>
      </ScrollReveal>

      <style>{`
        @keyframes pulse-dot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.7)} }
        @media (max-width: 640px) {
          .prob-sol-grid { grid-template-columns: 1fr !important; }
          .stats-grid    { grid-template-columns: 1fr !important; }
          .diff-grid     { grid-template-columns: 1fr !important; }
          .pricing-grid  { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </>
  )
}
