import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import CaseCard from '../components/CaseCard'
import MasteryScore from '../components/MasteryScore'
import Skeleton from '../components/Skeleton'
import EmptyIllustration from '../components/EmptyIllustration'
import { getTopicById } from '../physicsTopics'
import { useUserId } from '../hooks/useAuth'
import { apiFetch } from '../utils/api'

function CaseSkeleton() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} height={160} borderRadius={16} delay={i * 0.12} />
      ))}
    </div>
  )
}

export default function ChooseCase() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const skillId = searchParams.get('skill') || 'motion'
  const topic   = getTopicById(skillId)
  const userId  = useUserId()

  const [cases, setCases]     = useState([])
  const [loading, setLoading] = useState(true)
  const [mastery, setMastery] = useState(null)
  const [skillStatus, setSkillStatus] = useState('Not started')

  useEffect(() => {
    setLoading(true)

    const casesP = apiFetch(`/api/cases/${skillId}`)
      .then(res => {
        if (!res.ok) throw new Error(res.status)
        return res.json()
      })
      .then(data => Array.isArray(data) ? data : [])
      .catch(() => [])

    const progressP = apiFetch(`/api/progress/${userId}`)
      .then(r => {
        if (!r.ok) throw new Error(r.status)
        return r.json()
      })
      .then(data => {
        if (Array.isArray(data)) {
          const node = data.find(n => n.skill_id === skillId)
          if (node) {
            setMastery(node.mastery_score ?? 0)
            setSkillStatus(node.status)
          }
        }
      })
      .catch(() => {})

    Promise.all([casesP, progressP]).then(([caseData]) => {
      setCases(caseData)
      setLoading(false)
    })
  }, [skillId, userId])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Back link */}
      <Link to="/learn/skill-map" style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: 13, fontWeight: 600, color: 'var(--primary-text-muted)',
        textDecoration: 'none', transition: 'color 0.15s',
      }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent-main)' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--primary-text-muted)' }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
        </svg>
        Skill Map
      </Link>

      {/* Page header with mastery */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800,
            margin: '0 0 6px', letterSpacing: '-0.02em',
          }}>
            {topic ? topic.name : 'Practice Cases'}
          </h1>
          <p style={{ color: 'var(--primary-text-muted)', fontSize: 14, margin: 0, lineHeight: 1.5 }}>
            Choose a scenario to practice. Each one adapts to your level.
          </p>
        </div>
        {mastery != null && !loading && (
          <div style={{ flexShrink: 0, minWidth: 280 }}>
            <MasteryScore label={topic?.name || 'Mastery'} percent={mastery} />
          </div>
        )}
      </div>

      {/* Cases grid */}
      {loading ? (
        <CaseSkeleton />
      ) : cases.length === 0 ? (
        <div style={{
          padding: '48px 24px', textAlign: 'center',
          background: 'var(--bg-card)', border: '1px solid var(--border-light)',
          borderRadius: 16, color: 'var(--primary-text-muted)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
        }}>
          <EmptyIllustration type="no-cases" size={80} />
          <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--primary-text)' }}>No cases available yet</p>
          <p style={{ margin: 0, fontSize: 14 }}>Check back soon — we're adding more.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
          {cases.map(c => (
            <CaseCard
              key={c.id}
              title={c.title}
              subtitle={c.description}
              topicId={skillId}
              status={
                skillStatus === 'Mastered' ? 'mastered'
                : skillStatus === 'In progress' ? 'attempted'
                : undefined
              }
              onClick={() => navigate(`/learn/assess/${c.id}?skill=${skillId}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
