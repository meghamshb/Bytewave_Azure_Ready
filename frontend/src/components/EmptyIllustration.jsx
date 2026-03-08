import { memo } from 'react'

const ILLUSTRATIONS = {
  'no-cases': (s) => (
    <svg width={s} height={s} viewBox="0 0 80 80" fill="none">
      <rect x="24" y="20" width="32" height="44" rx="4" stroke="var(--accent-main)" strokeWidth="2" opacity="0.5" />
      <rect x="28" y="24" width="24" height="36" rx="2" stroke="var(--accent-main)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.3" />
      <circle cx="40" cy="42" r="6" stroke="var(--accent-main)" strokeWidth="1.5" opacity="0.4" />
      <path d="M37 42l2 2 4-4" stroke="var(--accent-main)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
      <path d="M20 56 Q40 68 60 56" stroke="var(--primary-text-muted)" strokeWidth="1" strokeDasharray="3 3" opacity="0.25" />
    </svg>
  ),

  'no-recommendations': (s) => (
    <svg width={s} height={s} viewBox="0 0 80 80" fill="none">
      <circle cx="40" cy="36" r="16" stroke="var(--accent-main)" strokeWidth="1.5" opacity="0.3" />
      <circle cx="40" cy="36" r="10" stroke="var(--accent-main)" strokeWidth="1.5" opacity="0.2" />
      <line x1="40" y1="22" x2="40" y2="14" stroke="var(--accent-main)" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      <line x1="40" y1="50" x2="40" y2="62" stroke="var(--accent-main)" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      <line x1="52" y1="28" x2="58" y2="22" stroke="var(--accent-main)" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
      <line x1="28" y1="44" x2="22" y2="50" stroke="var(--accent-main)" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
      <circle cx="40" cy="36" r="3" fill="var(--accent-main)" opacity="0.4" />
      <circle cx="58" cy="22" r="1.5" fill="var(--accent-main)" opacity="0.5" />
      <circle cx="22" cy="50" r="1.5" fill="var(--accent-main)" opacity="0.5" />
      <circle cx="40" cy="14" r="1.5" fill="var(--accent-main)" opacity="0.5" />
    </svg>
  ),

  'no-replies': (s) => (
    <svg width={s} height={s} viewBox="0 0 80 80" fill="none">
      <rect x="16" y="18" width="36" height="24" rx="12" stroke="var(--accent-main)" strokeWidth="1.5" opacity="0.35" />
      <path d="M22 44l-4 6v-6" stroke="var(--accent-main)" strokeWidth="1.5" strokeLinejoin="round" opacity="0.35" />
      <rect x="28" y="38" width="36" height="20" rx="10" stroke="var(--primary-text-muted)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.25" />
      <path d="M58 58l4 5v-5" stroke="var(--primary-text-muted)" strokeWidth="1.5" strokeLinejoin="round" strokeDasharray="4 3" opacity="0.25" />
      <line x1="24" y1="28" x2="40" y2="28" stroke="var(--accent-main)" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" />
      <line x1="24" y1="33" x2="34" y2="33" stroke="var(--accent-main)" strokeWidth="1.5" strokeLinecap="round" opacity="0.2" />
    </svg>
  ),

  'no-posts': (s) => (
    <svg width={s} height={s} viewBox="0 0 80 80" fill="none">
      <rect x="20" y="16" width="40" height="48" rx="4" stroke="var(--primary-text-muted)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.25" />
      <line x1="28" y1="28" x2="52" y2="28" stroke="var(--primary-text-muted)" strokeWidth="1.5" strokeLinecap="round" opacity="0.2" />
      <line x1="28" y1="34" x2="46" y2="34" stroke="var(--primary-text-muted)" strokeWidth="1.5" strokeLinecap="round" opacity="0.15" />
      <line x1="28" y1="40" x2="50" y2="40" stroke="var(--primary-text-muted)" strokeWidth="1.5" strokeLinecap="round" opacity="0.15" />
      <circle cx="52" cy="52" r="12" stroke="var(--accent-main)" strokeWidth="1.5" opacity="0.4" />
      <line x1="60" y1="60" x2="66" y2="66" stroke="var(--accent-main)" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
    </svg>
  ),

  'no-selection': (s) => (
    <svg width={s} height={s} viewBox="0 0 80 80" fill="none">
      <circle cx="30" cy="28" r="5" stroke="var(--accent-main)" strokeWidth="1.5" opacity="0.4" />
      <circle cx="54" cy="24" r="4" stroke="var(--accent-main)" strokeWidth="1.5" opacity="0.3" />
      <circle cx="42" cy="50" r="5" stroke="var(--accent-main)" strokeWidth="1.5" opacity="0.35" />
      <circle cx="22" cy="52" r="3" stroke="var(--primary-text-muted)" strokeWidth="1" opacity="0.25" />
      <circle cx="62" cy="46" r="3.5" stroke="var(--primary-text-muted)" strokeWidth="1" opacity="0.25" />
      <line x1="30" y1="28" x2="54" y2="24" stroke="var(--accent-main)" strokeWidth="1" opacity="0.15" />
      <line x1="30" y1="28" x2="42" y2="50" stroke="var(--accent-main)" strokeWidth="1" opacity="0.15" />
      <line x1="54" y1="24" x2="42" y2="50" stroke="var(--accent-main)" strokeWidth="1" opacity="0.15" />
      <line x1="42" y1="50" x2="62" y2="46" stroke="var(--primary-text-muted)" strokeWidth="1" opacity="0.1" />
      <line x1="22" y1="52" x2="42" y2="50" stroke="var(--primary-text-muted)" strokeWidth="1" opacity="0.1" />
      <circle cx="40" cy="36" r="2" fill="var(--accent-main)" opacity="0.3">
        <animate attributeName="opacity" values="0.3;0.6;0.3" dur="2s" repeatCount="indefinite" />
      </circle>
    </svg>
  ),
}

function EmptyIllustration({ type = 'no-cases', size = 80 }) {
  const render = ILLUSTRATIONS[type]
  if (!render) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      {render(size)}
    </div>
  )
}

export default memo(EmptyIllustration)
