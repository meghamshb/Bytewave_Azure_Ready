/**
 * useAuth — JWT-based auth context backed by the FastAPI backend.
 *
 * Flow:
 *   signUp / signIn / continueAsGuest  →  POST /api/auth/*  →  store JWT + user in localStorage
 *   On load, validate the stored token via GET /api/auth/me
 */

import { useState, useEffect, useCallback, createContext, useContext } from 'react'
import { getToken, setToken, clearToken, apiFetch } from '../utils/api'

const SESSION_KEY = 'bw_session_v2'

function saveSession(user) {
  if (user) localStorage.setItem(SESSION_KEY, JSON.stringify(user))
  else localStorage.removeItem(SESSION_KEY)
}

// ─── Context ─────────────────────────────────────────────────────────────────
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    const token = getToken()
    if (!token) {
      saveSession(null)
      setUser(null)
      setLoading(false)
      return
    }
    apiFetch('/api/auth/me')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(data => { setUser(data.user); saveSession(data.user) })
      .catch(() => { clearToken(); saveSession(null); setUser(null) })
      .finally(() => setLoading(false))
  }, [])

  const continueAsGuest = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/auth/guest', { method: 'POST' })
      if (!res.ok) throw new Error('Guest creation failed')
      const { user: u, token } = await res.json()
      setToken(token); saveSession(u); setUser(u)
      return u
    } catch (e) {
      setError('Could not create guest session.')
      return null
    }
  }, [])

  const signUp = useCallback(async (email, password, name) => {
    if (!email || !password) { setError('Email and password are required.'); return null }
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.detail || 'Sign up failed.'); return null }
      setToken(data.token); saveSession(data.user); setUser(data.user)
      return data.user
    } catch {
      setError('Sign up failed. Try again.')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const signIn = useCallback(async (email, password) => {
    if (!email || !password) { setError('Email and password are required.'); return null }
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.detail || 'Incorrect email or password.'); return null }
      setToken(data.token); saveSession(data.user); setUser(data.user)
      return data.user
    } catch {
      setError('Sign in failed. Try again.')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const signOut = useCallback(async () => {
    clearToken(); saveSession(null); setUser(null)
  }, [])

  const updateName = useCallback((name) => {
    setUser(prev => {
      if (!prev) return prev
      const next = { ...prev, name }
      saveSession(next)
      return next
    })
  }, [])

  const value = { user, loading, error, signUp, signIn, signOut, continueAsGuest, updateName, isAuthed: !!user }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** Returns the user's API-safe ID — falls back to '1' for unauthenticated state */
export function useUserId() {
  const { user } = useAuth()
  return user?.id ?? '1'
}
