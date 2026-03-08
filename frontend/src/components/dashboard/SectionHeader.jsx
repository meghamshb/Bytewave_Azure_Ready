import { IcoArrow } from './icons'

export default function SectionHeader({ title, action, onAction }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--primary-text)', letterSpacing: '-0.01em' }}>
        {title}
      </h2>
      {action && (
        <button type="button" onClick={onAction} style={{
          background: 'none', border: 'none', color: '#818cf8', fontSize: 12,
          fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
        }}>
          {action} <IcoArrow />
        </button>
      )}
    </div>
  )
}
