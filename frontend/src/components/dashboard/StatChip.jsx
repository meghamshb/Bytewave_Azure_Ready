export default function StatChip({ icon, value, label, color = '#818cf8' }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '16px 20px', borderRadius: 16,
      background: 'var(--bg-card)',
      border: '1px solid var(--border-light)',
      flex: '1 1 140px', minWidth: 0,
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
        background: `${color}18`,
        border: `1px solid ${color}30`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color,
      }}>
        {icon}
      </div>
      <div>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800,
          color: 'var(--primary-text)', lineHeight: 1, marginBottom: 3,
        }}>{value}</div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--primary-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </div>
      </div>
    </div>
  )
}
