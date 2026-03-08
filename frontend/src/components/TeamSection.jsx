import { useState } from 'react'
import teamProfiles from '../data/teamProfiles'

function LinkedInIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  )
}

function BuilderCard({ profile }) {
  const [hovered, setHovered] = useState(false)
  const { name, role, contribution, statement, avatar, linkedinUrl, initials, accentColor } = profile

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${hovered ? `${accentColor}40` : 'var(--border-light)'}`,
        borderRadius: 20,
        padding: '28px 24px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
        boxShadow: hovered
          ? `0 12px 40px ${accentColor}18, 0 0 0 1px ${accentColor}15`
          : '0 2px 12px rgba(0,0,0,0.06)',
        transition: 'transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Subtle top accent line */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, ${accentColor}, ${accentColor}60)`,
        opacity: hovered ? 1 : 0.4,
        transition: 'opacity 0.25s ease',
      }} />

      {/* Avatar + identity row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {avatar ? (
          <img
            src={avatar}
            alt={name}
            style={{
              width: 52, height: 52, borderRadius: '50%',
              objectFit: 'cover',
              border: `2px solid ${accentColor}40`,
              boxShadow: hovered ? `0 0 16px ${accentColor}30` : 'none',
              transition: 'box-shadow 0.25s ease',
            }}
          />
        ) : (
          <div style={{
            width: 52, height: 52, borderRadius: '50%',
            background: `linear-gradient(135deg, ${accentColor}30, ${accentColor}10)`,
            border: `2px solid ${accentColor}40`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 800, color: accentColor,
            boxShadow: hovered ? `0 0 16px ${accentColor}30` : 'none',
            transition: 'box-shadow 0.25s ease',
            flexShrink: 0,
          }}>
            {initials}
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 15, fontWeight: 700,
            color: 'var(--primary-text)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span>{name}</span>
            {linkedinUrl && (
              <a
                href={linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#0a66c2', display: 'flex', flexShrink: 0 }}
                onClick={e => e.stopPropagation()}
                aria-label={`${name} on LinkedIn`}
              >
                <LinkedInIcon />
              </a>
            )}
          </div>
          <div style={{
            fontSize: 12, fontWeight: 600, color: accentColor,
            marginTop: 2,
          }}>
            {role}
          </div>
        </div>
      </div>

      {/* Contribution badge */}
      <div style={{
        fontSize: 11, fontWeight: 600,
        color: 'var(--primary-text-muted)',
        padding: '6px 10px',
        background: `${accentColor}08`,
        border: `1px solid ${accentColor}15`,
        borderRadius: 8,
        lineHeight: 1.5,
      }}>
        {contribution}
      </div>

      {/* Statement */}
      <blockquote style={{
        margin: 0, padding: 0,
        fontSize: 13.5, lineHeight: 1.7,
        color: 'var(--primary-text)',
        fontStyle: 'italic',
        flex: 1,
      }}>
        "{statement}"
      </blockquote>
    </div>
  )
}

export default function TeamSection() {
  return (
    <section style={{
      padding: '80px 24px',
      background: 'var(--bg-card)',
      borderTop: '1px solid var(--border-light)',
      borderBottom: '1px solid var(--border-light)',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{
          fontSize: 10, fontWeight: 800,
          letterSpacing: '0.12em',
          color: 'var(--accent-main)',
          textTransform: 'uppercase',
          textAlign: 'center',
          marginBottom: 12,
        }}>
          Built by students
        </div>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 32, fontWeight: 700,
          textAlign: 'center',
          color: 'var(--primary-text)',
          margin: '0 0 8px',
        }}>
          Meet the builders
        </h2>
        <p style={{
          textAlign: 'center',
          fontSize: 14,
          color: 'var(--primary-text-muted)',
          margin: '0 0 48px',
          fontStyle: 'italic',
          fontFamily: 'var(--font-formula)',
        }}>
          Five friends who got tired of studying blind — so they built something better.
        </p>

        <div className="team-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 20,
        }}>
          {teamProfiles.map(profile => (
            <BuilderCard key={profile.name} profile={profile} />
          ))}
        </div>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .team-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  )
}
