import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Scroll to top on route changes; smooth-scroll to hash targets (e.g. /#how-it-works).
 *
 * Works cross-route: navigating from /learn to /#how-it-works will land on / first,
 * then this effect fires and scrolls to the anchor after the DOM settles.
 *
 * Resilient polling: landing page content may mount inside a lazy-loaded overlay
 * (HeroDashboard → LandingReveal), so we allow up to ~3s for the target to appear.
 */
export default function useScrollRestoration() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if (hash) {
      const id = hash.replace('#', '')
      const MAX_ATTEMPTS = 25
      const INTERVAL_MS  = 120

      const poll = (attempts = 0) => {
        const el = document.getElementById(id)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        } else if (attempts < MAX_ATTEMPTS) {
          setTimeout(() => poll(attempts + 1), INTERVAL_MS)
        }
      }
      setTimeout(() => poll(), 100)
    } else {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    }
  }, [pathname, hash])
}
