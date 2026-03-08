import { useState, useRef, useCallback } from 'react'

/**
 * useHoldActivation
 *
 * Tracks a press-and-hold gesture with a smooth 0→1 progress value.
 * Drives the HoldOverlay SVG ring.  When the hold completes the caller
 * sets activated=true and mounts the dashboard.
 *
 * The Spline scene handles its own built-in animations via native pointer
 * events — this hook only manages React UI state.
 *
 * @param {object}   options
 * @param {number}   options.duration   Hold duration in ms (default 800)
 * @param {function} options.onActivate Called once when hold completes
 */
export function useHoldActivation({ duration = 800, onActivate } = {}) {
  const [isHolding, setIsHolding] = useState(false)
  const [activated, setActivated] = useState(false)
  const [progress,  setProgress]  = useState(0)

  const timerRef      = useRef(null)   // setTimeout handle for the hold boundary
  const rafRef        = useRef(null)   // requestAnimationFrame handle
  const startTimeRef  = useRef(null)   // performance.now() at hold start
  const activatedRef  = useRef(false)  // stable guard — never reset once true

  // rAF tick — smooth progress updates without React re-render bottleneck
  const tick = useCallback(() => {
    if (!startTimeRef.current) return
    const elapsed = performance.now() - startTimeRef.current
    const clamped = Math.min(elapsed / duration, 1)
    setProgress(clamped)
    if (clamped < 1) {
      rafRef.current = requestAnimationFrame(tick)
    }
  }, [duration])

  /** Begin hold — wired to onSplineMouseDown */
  const startHold = useCallback(() => {
    if (activatedRef.current) return

    setIsHolding(true)
    setProgress(0)
    startTimeRef.current = performance.now()

    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(tick)

    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      cancelAnimationFrame(rafRef.current)
      setProgress(1)
      setIsHolding(false)
      setActivated(true)
      activatedRef.current = true
      onActivate?.()
    }, duration)
  }, [duration, onActivate, tick])

  /** Cancel hold — wired to onSplineMouseUp / onSplineMouseLeave */
  const cancelHold = useCallback(() => {
    if (activatedRef.current) return
    clearTimeout(timerRef.current)
    cancelAnimationFrame(rafRef.current)
    startTimeRef.current = null
    setIsHolding(false)
    setProgress(0)
  }, [])

  /** Reset — allows re-activation after the dashboard is dismissed */
  const reset = useCallback(() => {
    clearTimeout(timerRef.current)
    cancelAnimationFrame(rafRef.current)
    startTimeRef.current = null
    activatedRef.current = false
    setActivated(false)
    setIsHolding(false)
    setProgress(0)
  }, [])

  return { isHolding, activated, progress, startHold, cancelHold, reset }
}
