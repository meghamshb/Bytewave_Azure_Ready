/**
 * Auth screen — sign up / sign in / continue as guest
 * Redirects to /learn on success.
 */
import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import WaveMark from '../components/WaveMark'

const FIELD = {
  padding: '13px 16px', borderRadius: 10, fontSize: 14,
  background: 'var(--bg-card)', border: '1.5px solid var(--border-light)',
  color: 'var(--primary-text)', width: '100%', boxSizing: 'border-box',
  outline: 'none', fontFamily: 'var(--font-body)',
  transition: 'border-color 0.15s',
}
const BTN_PRIMARY = {
  padding: '13px', borderRadius: 10, fontSize: 14, fontWeight: 700,
  background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff',
  border: 'none', cursor: 'pointer', width: '100%',
  boxShadow: '0 4px 16px rgba(99,102,241,0.4)',
}
const BTN_GHOST = {
  padding: '12px', borderRadius: 10, fontSize: 14, fontWeight: 600,
  background: 'var(--bg-card)', color: 'var(--primary-text-muted)',
  border: '1.5px solid var(--border-light)', cursor: 'pointer', width: '100%',
}
const LABEL = { fontSize: 12, fontWeight: 600, color: 'var(--primary-text-muted)', marginBottom: 6, display: 'block' }

export default function Auth() {
  const navigate = useNavigate()
  const location = useLocation()
  const { signIn, signUp, continueAsGuest, loading, error } = useAuth()

  const demoLimitHit = location.state?.reason === 'demo_limit'
  const [mode,     setMode]     = useState(demoLimitHit ? 'signup' : 'signin') // 'signin' | 'signup'
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [name,     setName]     = useState('')
  const [focused,  setFocused]  = useState(null)

  const isSignup = mode === 'signup'

  const handle = async (e) => {
    e.preventDefault()
    let user
    if (isSignup) {
      user = await signUp(email, password, name)
    } else {
      user = await signIn(email, password)
    }
    if (user) navigate('/learn', { replace: true, state: { fromAuth: true } })
  }

  const handleGuest = async () => {
    const guest = await continueAsGuest()
    if (guest) navigate('/learn', { replace: true, state: { fromAuth: true } })
  }

  const fieldStyle = (name) => ({
    ...FIELD,
    borderColor: focused === name ? 'rgba(99,102,241,0.6)' : 'var(--border-light)',
    boxShadow: focused === name ? '0 0 0 3px rgba(99,102,241,0.12)' : 'none',
  })

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--primary-bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        {/* Logo */}
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: 40, justifyContent: 'center' }}>
          <WaveMark />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--primary-text)', letterSpacing: '-0.03em' }}>
            Byte Wave
          </span>
        </Link>

        {/* Card */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 20, padding: '36px 32px', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
          {demoLimitHit && (
            <div style={{
              padding: '12px 16px', borderRadius: 10, marginBottom: 20,
              background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)',
              fontSize: 13, color: '#818cf8', lineHeight: 1.5,
            }}>
              You've used your free demo tries. Sign up to get unlimited AI feedback, animations, and adaptive practice.
            </div>
          )}
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, margin: '0 0 6px', color: 'var(--primary-text)' }}>
            {isSignup ? 'Create your account' : 'Welcome back'}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--primary-text-muted)', margin: '0 0 28px' }}>
            {isSignup ? 'Start tracking your physics mastery.' : 'Sign in to your personalised study plan.'}
          </p>

          <form onSubmit={handle} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {isSignup && (
              <div>
                <label style={LABEL}>First name</label>
                <input
                  type="text" value={name} placeholder="e.g. Alex"
                  onChange={e => setName(e.target.value)}
                  onFocus={() => setFocused('name')} onBlur={() => setFocused(null)}
                  style={fieldStyle('name')}
                />
              </div>
            )}

            <div>
              <label style={LABEL}>Email</label>
              <input
                type="email" value={email} placeholder="you@school.com" required
                onChange={e => setEmail(e.target.value)}
                onFocus={() => setFocused('email')} onBlur={() => setFocused(null)}
                style={fieldStyle('email')}
              />
            </div>

            <div>
              <label style={LABEL}>Password</label>
              <input
                type="password" value={password} placeholder="8+ characters" required
                onChange={e => setPassword(e.target.value)}
                onFocus={() => setFocused('pwd')} onBlur={() => setFocused(null)}
                style={fieldStyle('pwd')}
                minLength={8}
              />
            </div>

            {error && (
              <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444', fontSize: 13 }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} style={{ ...BTN_PRIMARY, opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Please wait…' : isSignup ? 'Create account →' : 'Sign in →'}
            </button>
          </form>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border-light)' }} />
            <span style={{ fontSize: 12, color: 'var(--primary-text-muted)' }}>or</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border-light)' }} />
          </div>

          {/* Google OAuth — disabled until real auth is wired */}
          <button
            type="button"
            disabled
            style={{
              ...BTN_GHOST,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 10,
              opacity: 0.45, cursor: 'not-allowed',
            }}
          >
            <svg width={18} height={18} viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Google sign-in coming soon
          </button>

          {/* Guest */}
          <button type="button" onClick={handleGuest} style={BTN_GHOST}>
            Continue as guest — no account needed
          </button>

          {/* Switch mode */}
          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--primary-text-muted)' }}>
            {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              type="button"
              onClick={() => setMode(isSignup ? 'signin' : 'signup')}
              style={{ background: 'none', border: 'none', color: '#818cf8', fontWeight: 600, cursor: 'pointer', fontSize: 13, padding: 0 }}
            >
              {isSignup ? 'Sign in' : 'Sign up free'}
            </button>
          </p>
        </div>

        {/* Privacy note */}
        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 11, color: 'var(--primary-text-muted)' }}>
          🔒 We never sell student data. Work stays private.
        </p>
      </div>
    </div>
  )
}
