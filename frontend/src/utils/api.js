/**
 * Authenticated fetch wrapper.
 *
 * Drop-in replacement for `fetch()` that automatically attaches the
 * JWT token from localStorage as an Authorization header.
 */

const TOKEN_KEY = 'bw_token'

export function getToken()  { return localStorage.getItem(TOKEN_KEY) }
export function setToken(t) { localStorage.setItem(TOKEN_KEY, t) }
export function clearToken() { localStorage.removeItem(TOKEN_KEY) }

export async function apiFetch(url, options = {}) {
  const token = getToken()
  const headers = { ...(options.headers || {}) }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return fetch(url, { ...options, headers })
}
