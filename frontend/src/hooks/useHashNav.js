import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * Returns a click handler for hash links like "#how-it-works".
 *
 * - If the target element already exists in the DOM (e.g. HeroDashboard is open),
 *   scrolls directly to it.
 * - Otherwise, navigates to /#hash. Landing.jsx detects the hash, auto-activates
 *   HeroDashboard, and useScrollRestoration polls until the element mounts.
 *
 * Works from any route — always navigates to the landing page with the hash.
 */
export function useHashNav() {
  const navigate = useNavigate()

  return useCallback((hash) => {
    const id = hash.replace('#', '')

    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    navigate('/' + hash)
  }, [navigate])
}
