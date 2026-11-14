import { useEffect, useRef, useState } from 'react'

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Animate a number toward `target`, easing out. It starts from `from` on
 * mount; if the target changes mid-flight it carries on from wherever the
 * number had got to.
 */
export function useCountUp(target: number, duration = 900, from = 1): number {
  const [reduced] = useState(prefersReducedMotion)
  const [value, setValue] = useState(from)
  const latest = useRef(from)

  useEffect(() => {
    if (reduced) return
    const start = latest.current
    if (start === target) return
    const began = performance.now()
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, Math.max(0, (now - began) / duration))
      const next = start + (target - start) * (1 - Math.pow(1 - t, 3))
      latest.current = next
      setValue(next)
      if (t < 1) frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [target, duration, reduced])

  return reduced ? target : value
}
