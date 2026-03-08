export const IcoArrow = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
)

export const IcoStar = () => (
  <svg width={13} height={13} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
)

export const IcoFlame = () => (
  <svg width={13} height={13} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c0 0-4 4-4 9a4 4 0 0 0 8 0c0-1.5-.5-3-1.5-4.5C14 8 12 10 12 12c0-4-4-6-4-6s1 3 0 5c0-5 4-9 4-9z"/></svg>
)

export const IcoZap = () => (
  <svg width={13} height={13} viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
)

export const IcoCheck = () => (
  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
)

export const matchColor = (pct) =>
  pct >= 85 ? 'var(--accent-success)' : pct >= 65 ? 'var(--accent-warning)' : '#818cf8'
