import { memo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import WaveMark from './WaveMark'
import { useAuth } from '../hooks/useAuth'
import { PRIMARY_LINKS, IconMenu } from './nav/navConfig.jsx'
import UserMenu from './nav/UserMenu'
import MobileDrawer from './nav/MobileDrawer'

export default memo(function AppNav() {
  const { pathname } = useLocation()
  const navigate     = useNavigate()
  const { user, signOut } = useAuth()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    navigate('/', { replace: true })
  }

  return (
    <>
      <header className="bw-appnav" style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(6,6,20,0.82)', backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{
          maxWidth: '1200px', margin: '0 auto', height: 56,
          padding: '0 24px',
          display: 'flex', alignItems: 'center',
          gap: 20,
        }}>
          {/* Logo */}
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', flexShrink: 0 }}>
            <WaveMark />
            <span className="bw-appnav-wordmark" style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: '#fff', letterSpacing: '-0.03em' }}>
              Byte Wave
            </span>
          </Link>

          {/* Primary nav */}
          <nav className="bw-appnav-tabs" style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            {PRIMARY_LINKS.map(({ to, label, Icon, match }) => {
              const active = match(pathname)
              return (
                <Link key={to} to={to} aria-current={active ? 'page' : undefined}
                  title={label}
                  className="bw-nav-pill"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '8px 16px', borderRadius: 10,
                    fontSize: 13, fontWeight: 600, textDecoration: 'none',
                    letterSpacing: '0.01em', transition: 'all 0.15s ease',
                    color: active ? '#fff' : 'rgba(255,255,255,0.5)',
                    background: active ? 'linear-gradient(135deg, rgba(99,102,241,0.4), rgba(139,92,246,0.3))' : 'transparent',
                    border: active ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
                    whiteSpace: 'nowrap',
                  }}>
                  <Icon />
                  <span className="bw-appnav-label">{label}</span>
                </Link>
              )
            })}
          </nav>

          <div style={{ flex: 1 }} />

          {/* User / sign-in */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {user ? (
              <span className="bw-appnav-user-desktop">
                <UserMenu user={user} onSignOut={handleSignOut} />
              </span>
            ) : (
              <Link to="/auth" className="bw-appnav-signin-desktop" style={{
                padding: '7px 16px', borderRadius: 9,
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff',
                fontSize: 13, fontWeight: 600, textDecoration: 'none',
                boxShadow: '0 2px 12px rgba(99,102,241,0.4)',
              }}>
                Sign in
              </Link>
            )}

            <button
              className="bw-appnav-hamburger"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              style={{
                display: 'none', background: 'none', border: 'none',
                cursor: 'pointer', color: '#fff', padding: 4,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <IconMenu />
            </button>
          </div>
        </div>
      </header>

      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        pathname={pathname}
        user={user}
        onSignOut={handleSignOut}
      />

      <style>{`
        @keyframes bw-drawer-in {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
        .bw-nav-pill:hover {
          color: rgba(255,255,255,0.8) !important;
          background: rgba(255,255,255,0.06) !important;
        }
        @media (max-width: 640px) {
          .bw-appnav-tabs { max-width: none !important; gap: 0 !important; }
          .bw-appnav-label { display: none !important; }
          .bw-appnav-wordmark { display: none !important; }
          .bw-appnav-user-desktop { display: none !important; }
          .bw-appnav-signin-desktop { display: none !important; }
          .bw-appnav-hamburger { display: flex !important; }
        }
      `}</style>
    </>
  )
})
