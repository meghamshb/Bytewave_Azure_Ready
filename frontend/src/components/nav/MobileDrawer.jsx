import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { IconClose, PRIMARY_LINKS, SECONDARY_LINKS, MENU_ITEM_STYLE } from './navConfig.jsx'

export default function MobileDrawer({ open, onClose, pathname, user, onSignOut }) {
  const navigate = useNavigate()

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 998,
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
      }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 999,
        width: 280, maxWidth: '80vw',
        background: 'var(--bg-card)',
        borderLeft: '1px solid var(--border-light)',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.2)',
        display: 'flex', flexDirection: 'column',
        animation: 'bw-drawer-in 0.2s ease',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border-light)',
        }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--primary-text)' }}>
            Menu
          </span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--primary-text-muted)', padding: 4,
            display: 'flex', alignItems: 'center',
          }}>
            <IconClose />
          </button>
        </div>

        <nav style={{ padding: '12px 12px', display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
          {PRIMARY_LINKS.map(({ to, label, Icon, match }) => {
            const active = match(pathname)
            return (
              <Link key={to} to={to} onClick={onClose} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px', borderRadius: 12,
                fontSize: 14, fontWeight: 600, textDecoration: 'none',
                color: active ? '#fff' : 'var(--primary-text)',
                background: active ? 'var(--gradient-accent)' : 'transparent',
                boxShadow: active ? '0 2px 8px rgba(99,102,241,0.35)' : 'none',
                transition: 'background 0.15s',
              }}>
                <Icon />
                {label}
              </Link>
            )
          })}

          <div style={{ margin: '8px 16px', borderTop: '1px solid var(--border-light)' }} />
          <div style={{ padding: '4px 16px 4px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--primary-text-muted)', textTransform: 'uppercase' }}>
            Explore
          </div>

          {SECONDARY_LINKS.map(({ to, label, Icon, match }) => {
            const active = match(pathname)
            return (
              <Link key={to} to={to} onClick={onClose} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 16px', borderRadius: 12,
                fontSize: 13, fontWeight: 600, textDecoration: 'none',
                color: active ? '#fff' : 'var(--primary-text-muted)',
                background: active ? 'var(--gradient-accent)' : 'transparent',
                boxShadow: active ? '0 2px 8px rgba(99,102,241,0.35)' : 'none',
                transition: 'background 0.15s',
              }}>
                <Icon />
                {label}
              </Link>
            )
          })}
        </nav>

        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-light)' }}>
          {user ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary-text)' }}>
                {user.name || 'Student'}
                {user.isGuest && <span style={{ fontSize: 10, color: '#f59e0b', marginLeft: 8 }}>GUEST</span>}
              </div>
              <button onClick={() => { onClose(); onSignOut() }} style={{
                ...MENU_ITEM_STYLE, color: '#ef4444', padding: '8px 0',
              }}>
                Sign out
              </button>
            </div>
          ) : (
            <Link to="/auth" onClick={onClose} style={{
              display: 'block', textAlign: 'center',
              padding: '10px', borderRadius: 10,
              background: 'var(--gradient-accent)', color: '#fff',
              fontSize: 13, fontWeight: 700, textDecoration: 'none',
            }}>
              Sign in
            </Link>
          )}
        </div>
      </div>
    </>
  )
}
