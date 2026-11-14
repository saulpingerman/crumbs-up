import { useId } from 'react'
import { cn } from '@/lib/cn'

/**
 * A little cookie rolling back and forth: the "working on it" mark for
 * anything to do with a photo. It is `1em` tall and a bit over twice as wide,
 * so set its size with a text size. Decorative — say what's happening in words
 * beside it.
 */
export function RollingCookie({ className }: { className?: string }) {
  const id = useId()
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex h-[1em] w-[2.2em] shrink-0 items-center justify-center',
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-[1em] animate-roll">
        <mask id={id}>
          <rect width="24" height="24" fill="#fff" />
          <circle cx="20.5" cy="4.5" r="4.2" />
          <circle cx="16" cy="1.6" r="2.4" />
          <circle cx="23" cy="9.2" r="2.4" />
        </mask>
        <g mask={`url(#${id})`}>
          <circle cx="12" cy="12" r="11" fill="var(--baked-1)" />
          <circle cx="12" cy="12" r="10.4" fill="none" stroke="var(--baked-2)" strokeWidth="1.2" />
          <g fill="var(--baked-ink)">
            <circle cx="8" cy="7.6" r="1.8" />
            <circle cx="13.4" cy="8.8" r="1.4" />
            <circle cx="6.4" cy="13.6" r="1.5" />
            <circle cx="12" cy="14.2" r="1.9" />
            <circle cx="17.6" cy="13.4" r="1.5" />
            <circle cx="9.6" cy="18.6" r="1.5" />
            <circle cx="15.4" cy="18.2" r="1.6" />
          </g>
        </g>
      </svg>
    </span>
  )
}
