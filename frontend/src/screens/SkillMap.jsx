import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import TopicAnimation from '../components/TopicAnimation'
import Skeleton from '../components/Skeleton'
import EmptyIllustration from '../components/EmptyIllustration'

import { getTopicById } from '../physicsTopics'
import { useUserId } from '../hooks/useAuth'
import { track, EVENTS } from '../hooks/useAnalytics'

// ─── Constellation layout ─────────────────────────────────────────────────────
// Node (x,y) positions inside an 820 × 490 viewBox — spread across the full canvas
const NODES = {
  motion:      { x: 185, y: 95  },
  gravity:     { x: 75,  y: 260 },
  forces:      { x: 268, y: 262 },
  energy:      { x: 382, y: 108 },
  heat:        { x: 298, y: 398 },
  waves:       { x: 498, y: 88  },
  electricity: { x: 568, y: 242 },
  magnetism:   { x: 462, y: 388 },
  light:       { x: 658, y: 112 },
  quantum:     { x: 738, y: 312 },
}

// Edges encode topic relationships
const EDGES = [
  ['motion',   'gravity'],
  ['motion',   'forces'],
  ['motion',   'energy'],
  ['forces',   'gravity'],
  ['forces',   'energy'],
  ['energy',   'heat'],
  ['energy',   'waves'],
  ['heat',     'magnetism'],
  ['waves',    'electricity'],
  ['waves',    'light'],
  ['electricity', 'magnetism'],
  ['electricity', 'light'],
  ['electricity', 'quantum'],
  ['light',    'quantum'],
]

// Status visual config
const CFG = {
  'not-started': { ring: '#6b7280', ringActive: '#a5b4fc', glow: 'none',                              dot: '#6b7280', label: 'Not started', bar: '#6b7280' },
  'in-progress': { ring: '#fbbf24', ringActive: '#fbbf24', glow: '0 0 22px rgba(251,191,36,0.55)',   dot: '#fbbf24', label: 'In progress', bar: '#fbbf24' },
  'mastered':    { ring: '#34d399', ringActive: '#34d399', glow: '0 0 22px rgba(52,211,153,0.55)',    dot: '#34d399', label: 'Mastered',    bar: '#34d399' },
}

function statusKey(node) {
  if (node.status === 'Mastered')    return 'mastered'
  if (node.status === 'In progress') return 'in-progress'
  return 'not-started'
}

// ─── Detail panel (right side) ────────────────────────────────────────────────
function DetailPanel({ node, onStart }) {
  if (!node) {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 12,
        padding: 32, color: 'var(--primary-text-muted)',
      }}>
        <EmptyIllustration type="no-selection" size={72} />
        <p style={{ margin: 0, fontSize: 14, textAlign: 'center' }}>
          Click any node<br />to explore that topic
        </p>
      </div>
    )
  }

  const sk      = statusKey(node)
  const cfg     = CFG[sk]
  const accentColor = cfg.ringActive
  const topic   = getTopicById(node.skill_id)
  const mastery = node.mastery_score ?? 0
  const circ    = 2 * Math.PI * 40

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      gap: 24, padding: '32px 32px 32px 24px',
      minWidth: 0,
    }}>

      {/* ── Big animated illustration ── */}
      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        background: 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 20, padding: '24px 0',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: `radial-gradient(ellipse 60% 50% at 50% 50%, ${accentColor}18, transparent 70%)`,
          pointerEvents: 'none',
        }} />
        <TopicAnimation topicId={node.skill_id} size={120} />
      </div>

      {/* ── Name + status ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <h2 style={{
            margin: 0, fontFamily: 'var(--font-display)',
            fontSize: 20, fontWeight: 800, color: 'var(--primary-text)',
            letterSpacing: '-0.02em', lineHeight: 1.2,
          }}>
            {node.skill_name}
          </h2>
          <span style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.07em', color: accentColor,
            background: `${accentColor}18`, border: `1px solid ${accentColor}40`,
            padding: '2px 8px', borderRadius: 20, flexShrink: 0,
          }}>
            {sk === 'mastered' ? '✓ ' : ''}{cfg.label}
          </span>
        </div>
        {topic?.description && (
          <p style={{
            margin: 0, fontSize: 13, color: 'var(--primary-text-muted)', lineHeight: 1.6,
          }}>
            {topic.description}
          </p>
        )}
      </div>

      {/* ── Mastery ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <svg width={90} height={90} style={{ flexShrink: 0 }}>
          <circle cx={45} cy={45} r={40} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6} />
          <circle
            cx={45} cy={45} r={40}
            fill="none" stroke={accentColor} strokeWidth={6}
            strokeDasharray={circ} strokeDashoffset={circ * (1 - mastery / 100)}
            strokeLinecap="round" transform="rotate(-90 45 45)"
            style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1)' }}
          />
          <text x="45" y="51" textAnchor="middle"
            fontSize={mastery > 0 ? 17 : 13} fontWeight="800"
            fill={mastery > 0 ? accentColor : 'var(--primary-text-muted)'}
            fontFamily="var(--font-display)">
            {mastery > 0 ? `${mastery}%` : '—'}
          </text>
        </svg>
        <div>
          <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--primary-text-muted)' }}>
            Mastery
          </p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--primary-text)', lineHeight: 1.5 }}>
            {mastery === 0   ? 'Not started yet — try your first case.'
            : mastery < 50   ? 'Early stage — keep going.'
            : mastery < 80   ? 'Good progress — almost there.'
            : mastery < 100  ? 'Nearly mastered — one more push.'
            :                  'Fully mastered!'}
          </p>
        </div>
      </div>

      {/* ── CTA ── */}
      <button
        type="button"
        onClick={onStart}
        style={{
          padding: '13px 0', borderRadius: 14, width: '100%',
          background: sk === 'mastered'
            ? 'rgba(52,211,153,0.12)'
            : sk === 'not-started'
              ? 'linear-gradient(135deg, rgba(99,102,241,0.35), rgba(139,92,246,0.25))'
              : 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(139,92,246,0.2))',
          border: `1.5px solid ${sk === 'not-started' ? '#818cf8' : accentColor}`,
          color: sk === 'not-started' ? '#c7d2fe' : accentColor,
          fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700,
          cursor: 'pointer', letterSpacing: '0.02em',
          boxShadow: sk === 'not-started'
            ? '0 0 24px rgba(99,102,241,0.35)'
            : `0 0 20px ${accentColor}25`,
          transition: 'all 0.2s ease',
        }}
      >
        {sk === 'mastered' ? 'Practice again →' : sk === 'in-progress' ? 'Continue →' : 'Start practice →'}
      </button>
    </div>
  )
}

// ─── SVG Constellation ────────────────────────────────────────────────────────
function Constellation({ nodes, selected, onSelect, filter }) {
  const [hovered, setHovered] = useState(null)

  // Pre-compute status lookup for fast access
  const byId = useMemo(() => {
    const m = {}
    nodes.forEach(n => { m[n.skill_id] = n })
    return m
  }, [nodes])

  const active = hovered || selected

  return (
    <div style={{
      flex: 1, width: '100%',
      background: 'rgba(0,0,0,0.35)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 24,
      overflow: 'hidden',
      position: 'relative',
      display: 'flex', flexDirection: 'column',
    }}>

      {/* Starfield background dots */}
      <svg
        viewBox="0 0 820 490"
        style={{ width: '100%', flex: 1, display: 'block', cursor: 'default' }}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Static background stars */}
        {[
          [40,35],[90,140],[160,420],[210,45],[390,450],[480,35],
          [560,420],[630,55],[720,185],[35,310],[755,420],[380,225],
          [680,430],[110,275],[460,200],[255,165],[600,280],[75,70],
          [320,50],[140,480],[700,80],[820,250],[50,460],[750,160],
          [420,470],[170,200],[640,350],[290,130],[530,460],[810,110],
        ].map(([x,y],i) => (
          <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 1.1 : 0.7}
            fill="rgba(255,255,255,0.25)"
            opacity={0.25 + (i % 5) * 0.12}
          />
        ))}

        {/* ── Edges ── */}
        {EDGES.map(([a, b]) => {
          const na = NODES[a], nb = NODES[b]
          const nodeA = byId[a], nodeB = byId[b]
          const bothMastered = nodeA?.status === 'Mastered' && nodeB?.status === 'Mastered'
          const eitherActive = active === a || active === b
          const activeNode = active === a ? nodeA : active === b ? nodeB : null
          const activeColor = activeNode ? CFG[statusKey(activeNode)]?.ringActive : null
          return (
            <line
              key={`${a}-${b}`}
              x1={na.x} y1={na.y} x2={nb.x} y2={nb.y}
              stroke={
                bothMastered   ? '#34d39950'
                : eitherActive ? `${activeColor || '#6366f1'}88`
                : 'rgba(255,255,255,0.07)'
              }
              strokeWidth={eitherActive ? 1.8 : 1}
              style={{ transition: 'stroke 0.25s ease, stroke-width 0.25s ease' }}
            />
          )
        })}

        {/* ── Nodes ── */}
        {nodes.map(n => {
          const pos   = NODES[n.skill_id]
          if (!pos) return null
          const sk    = statusKey(n)
          const cfg   = CFG[sk]
          const topic = getTopicById(n.skill_id)
          const isSel = selected === n.skill_id
          const isHov = hovered  === n.skill_id
          const isAct = isSel || isHov
          const matchesFilter = filter === 'all' || sk === filter
          const nodeOpacity = matchesFilter ? 1 : 0.18

          const color = isAct ? cfg.ringActive : cfg.ring
          const r = isSel ? 30 : isHov ? 26 : 21

          return (
            <g
              key={n.skill_id}
              style={{ cursor: 'pointer', opacity: nodeOpacity, transition: 'opacity 0.3s ease' }}
              onClick={() => onSelect(n.skill_id)}
              onMouseEnter={() => setHovered(n.skill_id)}
              onMouseLeave={() => setHovered(null)}
            >
              {/* Outer glow ring */}
              {isAct && (
                <circle
                  cx={pos.x} cy={pos.y} r={r + 8}
                  fill="none"
                  stroke={color}
                  strokeWidth={1.2}
                  opacity={0.45}
                />
              )}

              {/* Pulsing ring for in-progress */}
              {sk === 'in-progress' && (
                <circle
                  cx={pos.x} cy={pos.y} r={r + 4}
                  fill="none" stroke={cfg.ring} strokeWidth={1.2} opacity={0.5}
                  style={{ animation: 'constellation-pulse 2s ease-in-out infinite' }}
                />
              )}

              {/* Main circle */}
              <circle
                cx={pos.x} cy={pos.y} r={r}
                fill={isAct ? `${color}22` : 'rgba(10,10,20,0.85)'}
                stroke={color}
                strokeWidth={isSel ? 2.5 : 1.5}
                style={{ transition: 'r 0.2s ease, fill 0.2s ease, stroke 0.2s ease, stroke-width 0.2s ease' }}
              />

              {/* Mastery fill arc */}
              {(n.mastery_score ?? 0) > 0 && (
                <circle
                  cx={pos.x} cy={pos.y} r={r - 4}
                  fill="none"
                  stroke={color}
                  strokeWidth={2.5}
                  strokeDasharray={2 * Math.PI * (r - 4)}
                  strokeDashoffset={2 * Math.PI * (r - 4) * (1 - (n.mastery_score ?? 0) / 100)}
                  strokeLinecap="round"
                  transform={`rotate(-90 ${pos.x} ${pos.y})`}
                  opacity={0.6}
                />
              )}

              {/* Center content: mastery % or dot */}
              {(n.mastery_score ?? 0) > 0 && isAct ? (
                <text
                  x={pos.x} y={pos.y + 4}
                  textAnchor="middle"
                  fontSize={isSel ? 11 : 9}
                  fontWeight="800"
                  fill={color}
                  fontFamily="var(--font-display)"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {n.mastery_score}%
                </text>
              ) : (
                <circle cx={pos.x} cy={pos.y} r={isSel ? 5 : 4}
                  fill={isAct ? color : (sk === 'not-started' ? 'rgba(255,255,255,0.25)' : cfg.ring)}
                  style={{ transition: 'r 0.2s ease, fill 0.2s ease' }}
                />
              )}

              {/* Topic name label */}
              <text
                x={pos.x}
                y={pos.y + r + 16}
                textAnchor="middle"
                fontSize={isAct ? 11.5 : 10}
                fontWeight={isAct ? '700' : '500'}
                fill={isAct ? color : 'rgba(255,255,255,0.5)'}
                fontFamily="var(--font-display)"
                style={{ transition: 'font-size 0.15s ease, fill 0.2s ease', pointerEvents: 'none', userSelect: 'none' }}
              >
                {topic?.name}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Legend */}
      <div style={{
        position: 'absolute', bottom: 12, left: 16,
        display: 'flex', gap: 14, alignItems: 'center',
      }}>
        {[['#34d399','Mastered'], ['#fbbf24','In progress'], ['#4b5563','Not started']].map(([c,l]) => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: c }} />
            <span style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function SkillMapSkeleton() {
  return (
    <div style={{ display: 'flex', gap: 20 }}>
      <Skeleton height={480} borderRadius={24} style={{ flex: 1 }} />
      <Skeleton height={480} borderRadius={24} delay={0.18} style={{ flexShrink: 0, width: 340 }} />
    </div>
  )
}

// ─── Overall mastery bar ──────────────────────────────────────────────────────
function OverallBar({ nodes }) {
  const mastered   = nodes.filter(n => n.status === 'Mastered').length
  const inProgress = nodes.filter(n => n.status === 'In progress').length
  const attempted  = nodes.filter(n => n.status !== 'Not started')
  const pct = attempted.length
    ? Math.round(attempted.reduce((s, n) => s + (n.mastery_score ?? 0), 0) / attempted.length)
    : 0

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 20,
      padding: '14px 20px', borderRadius: 16,
      background: 'var(--bg-card)', border: '1px solid var(--border-light)',
      flexWrap: 'wrap',
    }}>
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary-text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Overall mastery</span>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 800, color: 'var(--accent-main)' }}>{pct > 0 ? `${pct}%` : '—'}</span>
        </div>
        <div style={{ height: 5, borderRadius: 99, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 99, width: `${pct}%`, background: 'linear-gradient(90deg, #6366f1, #34d399)', transition: 'width 1s ease' }} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 20 }}>
        {[
          { v: mastered,   c: '#34d399', l: 'Mastered' },
          { v: inProgress, c: '#fbbf24', l: 'Learning' },
          { v: nodes.length - mastered - inProgress, c: '#4b5563', l: 'New' },
        ].map(({ v, c, l }) => (
          <div key={l} style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, color: c }}>{v}</div>
            <div style={{ fontSize: 10, color: 'var(--primary-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{l}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────
const FILTER_TABS = [
  { key: 'all',          label: 'All' },
  { key: 'in-progress',  label: 'In Progress' },
  { key: 'mastered',     label: 'Mastered' },
  { key: 'not-started',  label: 'Not Started' },
]

export default function SkillMap() {
  const navigate = useNavigate()
  const userId   = useUserId()
  const [nodes,    setNodes]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState(null)
  const [filter,   setFilter]   = useState('all')
  const [mobile,   setMobile]   = useState(() => window.innerWidth < 768)

  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    track(EVENTS.SKILL_MAP_OPENED)
    setLoading(true)
    const minDelay = new Promise(r => setTimeout(r, 600))
    Promise.all([
      fetch(`/api/progress/${userId}`)
        .then(r => { if (!r.ok) throw new Error('API unavailable'); return r.json() }),
      minDelay,
    ])
      .then(([d]) => {
        const data = Array.isArray(d) ? d : []
        setNodes(data)
        const first = data.find(n => n.status === 'In progress') || data[0]
        if (first) setSelected(first.skill_id)
        setLoading(false)
      })
      .catch(() => {
        setNodes([])
        setLoading(false)
      })
  }, [userId])

  const selectedNode = useMemo(
    () => nodes.find(n => n.skill_id === selected) ?? null,
    [nodes, selected]
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Header ── */}
      <div>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800,
          margin: '0 0 6px', letterSpacing: '-0.02em',
        }}>
          Skill Map
        </h1>
        <p style={{ color: 'var(--primary-text-muted)', fontSize: 14, margin: 0, lineHeight: 1.5 }}>
          Tap any node to explore a topic. Lines show how concepts connect.
        </p>
      </div>

      {loading ? <SkillMapSkeleton /> : (
        <>
          <OverallBar nodes={nodes} />

          {/* ── Filter tabs ── */}
          <div style={{
            display: 'flex', gap: 4,
            background: 'var(--bg-card)', border: '1px solid var(--border-light)',
            borderRadius: 14, padding: 4, alignSelf: 'flex-start',
          }}>
            {FILTER_TABS.map(({ key, label }) => (
              <button
                key={key} type="button"
                onClick={() => setFilter(key)}
                style={{
                  padding: '8px 18px', borderRadius: 10,
                  fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
                  background: filter === key ? 'var(--gradient-accent)' : 'transparent',
                  color: filter === key ? '#fff' : 'var(--primary-text-muted)',
                  boxShadow: filter === key ? '0 2px 8px rgba(99,102,241,0.35)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── Constellation + Detail ── */}
          <div style={{
            display: 'flex',
            flexDirection: mobile ? 'column' : 'row',
            gap: 20, alignItems: 'stretch',
            minHeight: mobile ? 'auto' : 'calc(100vh - 280px)',
          }}>
            {/* Constellation */}
            <div style={{
              flex: '1 1 480px', minWidth: 0,
              display: 'flex', flexDirection: 'column',
              minHeight: mobile ? 340 : 'auto',
              overflowX: mobile ? 'auto' : 'visible',
            }}>
              <Constellation
                nodes={nodes}
                selected={selected}
                filter={filter}
                onSelect={(id) => {
                  setSelected(id)
                  track(EVENTS.TOPIC_SELECTED, { topic: id })
                  if (mobile) {
                    setTimeout(() => document.getElementById('skill-detail')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100)
                  }
                }}
              />
            </div>

            {/* Detail panel */}
            <div id="skill-detail" style={{
              flex: mobile ? '0 0 auto' : '0 0 340px',
              minWidth: mobile ? 0 : 280,
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 24, overflow: 'hidden',
              display: 'flex', flexDirection: 'column',
            }}>
              <DetailPanel
                node={selectedNode}
                onStart={() => selected && navigate('/learn/choose-case?skill=' + selected)}
              />
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes constellation-pulse {
          0%,100% { r: 20; opacity: 0.5; }
          50%      { r: 26; opacity: 0.15; }
        }
      `}</style>
    </div>
  )
}
