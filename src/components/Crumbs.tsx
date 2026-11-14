import type { CSSProperties } from 'react'
import { cn } from '@/lib/cn'
import type { Crumb } from './scatter'

interface Props {
  crumbs: Crumb[]
  /** Milliseconds before the first one moves. */
  delay?: number
  /** How long each one is in the air. */
  duration?: number
  /** Positions the point they fly out from. */
  className?: string
  style?: CSSProperties
}

/**
 * A puff of crumbs flying out from a point, once. Pure decoration: it takes
 * no space, catches no taps, and people who ask for less motion never see it
 * (the crumbs start and end invisible, and reduced motion skips the middle).
 */
export function Crumbs({ crumbs, delay = 0, duration = 900, className, style }: Props) {
  return (
    <span
      aria-hidden
      data-testid="crumbs"
      className={cn('pointer-events-none absolute block size-0', className)}
      style={style}
    >
      {crumbs.map((crumb, i) => (
        <span
          key={i}
          className="absolute block animate-crumb"
          style={
            {
              width: crumb.size,
              height: crumb.size * crumb.squash,
              left: -crumb.size / 2,
              top: -crumb.size / 2,
              background: crumb.shade,
              borderRadius: crumb.round,
              animationDelay: `${delay + crumb.wait}ms`,
              '--crumb-time': `${duration}ms`,
              '--dx': `${crumb.dx}px`,
              '--up': `${crumb.up}px`,
              '--fall': `${crumb.fall}px`,
              '--spin': `${crumb.spin}deg`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  )
}
