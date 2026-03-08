import EmptyIllustration from '../EmptyIllustration'
import { IcoArrow } from './icons'

export default function EmptyState({ message, cta, onCta }) {
  return (
    <div style={{ textAlign: 'center', padding: '28px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <EmptyIllustration type="no-recommendations" size={72} />
      <p style={{ fontSize: 14, color: 'var(--primary-text-muted)', margin: 0 }}>{message}</p>
      {cta && (
        <button type="button" onClick={onCta} style={{
          background: 'none', border: 'none', color: '#818cf8',
          fontWeight: 700, fontSize: 14, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          {cta} <IcoArrow />
        </button>
      )}
    </div>
  )
}
