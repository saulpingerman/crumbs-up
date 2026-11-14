import { useEffect, useState } from 'react'

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Animate a number toward `target`, easing out. Starts from `from` on mount. */
export function useCountUp(target: number, duration = 900, from = 1): number {
  const [reduced] = useState(prefersReducedMotion)
  const [value, setValue] = useState(from)

  useEffect(() => {
    if (reduced) return
    let frame = 0
    let start: number | null = null
    let began = 0
    const tick = (now: number) => {
      if (start === null) {
        // Read the starting point inside the frame so a retarget mid-flight
        // continues from wherever the number currently is.
        began = now
        setValue((current) => {
          start = current
          return current
        })
        frame = requestAnimationFrame(tick)
        return
      }
      const t = Math.min(1, (now - began) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(start + (target - start) * eased)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, duration, reduced])

  return reduced ? target : value
}
