import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MENU_ITEM_STYLE } from './navConfig.jsx'

export default function UserMenu({ user, onSignOut }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const initials = (user.name || 'S').slice(0, 2).toUpperCase()

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={user.name || 'Account'}
        style={{
          width: 36, height: 36, borderRadius: '50%', cursor: 'pointer',
          background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
          border: open ? '2px solid rgba(129,140,248,0.8)' : '2px solid rgba(129,140,248,0.3)',
          color: '#fff', fontSize: 12, fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'border-color 0.15s',
          boxShadow: open ? '0 0 0 3px rgba(99,102,241,0.2)' : 'none',
        }}
      >
        {initials}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 44, right: 0, zIndex: 200,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-light)',
          borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          minWidth: 200, overflow: 'hidden',
        }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-light)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary-text)' }}>{user.name || 'Student'}</div>
            {user.email && <div style={{ fontSize: 11, color: 'var(--primary-text-muted)', marginTop: 2 }}>{user.email}</div>}
            {user.isGuest && (
              <div style={{
                marginTop: 6, fontSize: 10, fontWeight: 700, color: '#f59e0b',
                background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)',
                borderRadius: 6, padding: '2px 8px', display: 'inline-block',
              }}>GUEST SESSION</div>
            )}
          </div>

          {user.isGuest && (
            <button onClick={() => { setOpen(false); navigate('/auth') }} style={MENU_ITEM_STYLE}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
              </svg>
              Create account — save progress
            </button>
          )}
          <button onClick={() => { setOpen(false); navigate('/learn/skill-map') }} style={MENU_ITEM_STYLE}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
            </svg>
            My Skill Map
          </button>
          <button onClick={() => { setOpen(false); onSignOut() }} style={{ ...MENU_ITEM_STYLE, color: '#ef4444' }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
