import { useId } from 'react'
import { cn } from '@/lib/cn'
import { CATEGORY_META, formatScore, type Category, type OverallPrecision } from '@/lib/rubric'
import { categoryBg, categoryText } from './category-styles'

/* ------------------------------ Medallion ------------------------------- */

const SCALLOPS = 14
const R = 46
const ARC = 12.5

/** A circle with a scalloped, biscuit-like edge, drawn in a 100×100 box. */
const SCALLOP_PATH = (() => {
  const points = Array.from({ length: SCALLOPS }, (_, i) => {
    const a = (i / SCALLOPS) * Math.PI * 2 - Math.PI / 2
    return [50 + R * Math.cos(a), 50 + R * Math.sin(a)] as const
  })
  const [first, ...rest] = points
  const arcs = [...rest, first!]
    .map(([x, y]) => `A${ARC} ${ARC} 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ')
  return `M${first![0].toFixed(2)} ${first![1].toFixed(2)} ${arcs}Z`
})()

const medallionSizes = {
  xs: 'size-9 text-[13px]',
  sm: 'size-12 text-[17px]',
  md: 'size-16 text-2xl',
  lg: 'size-24 text-[40px]',
  xl: 'size-40 text-[68px]',
} as const

interface MedallionProps {
  /** Text to show — pass a string to control formatting (e.g. while counting up). */
  value: number | string
  precision?: OverallPrecision
  size?: keyof typeof medallionSizes
  className?: string
  label?: string
}

/**
 * The overall score, stamped on a golden biscuit. Used wherever a cookie's
 * headline number appears so it is recognisable at a glance.
 */
export function Medallion({
  value,
  precision = 'half',
  size = 'md',
  className,
  label,
}: MedallionProps) {
  const id = useId()
  const text = typeof value === 'number' ? formatScore(value, precision) : value
  return (
    <span
      role="img"
      aria-label={label ?? `Overall score ${text} out of 10`}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center drop-shadow-[0_3px_5px_rgb(60_30_10/0.28)]',
        medallionSizes[size],
        className,
      )}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden>
        <defs>
          <linearGradient id={id} x1="20" y1="8" x2="80" y2="96" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="var(--baked-1)" />
            <stop offset="1" stopColor="var(--baked-2)" />
          </linearGradient>
        </defs>
        <path d={SCALLOP_PATH} fill={`url(#${id})`} />
        <circle
          cx="50"
          cy="50"
          r="37"
          fill="none"
          stroke="var(--baked-ink)"
          strokeOpacity="0.22"
          strokeWidth="1.2"
          strokeDasharray="0.5 4.2"
          strokeLinecap="round"
        />
      </svg>
      <span aria-hidden className="numerals relative leading-none font-semibold text-baked-ink">
        {text}
      </span>
    </span>
  )
}

/* ------------------------------ Categories ------------------------------ */

interface ScoreBarProps {
  category: Category
  score: number
  className?: string
  /** Hide the label row and show only the bar. */
  bare?: boolean
}

/**
 * A category score on a 0–10 track. The notch at 5 is the "Toll House
 * line": everything in this app is measured against that standard cookie.
 */
export function ScoreBar({ category, score, className, bare }: ScoreBarProps) {
  const meta = CATEGORY_META[category]
  return (
    <div className={className}>
      {!bare && (
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-sm font-semibold text-ink">{meta.label}</span>{' '}
          <span className={cn('numerals text-xl font-semibold', categoryText[category])}>
            {formatScore(score)}
          </span>
        </div>
      )}
      <div
        role="meter"
        aria-label={meta.label}
        aria-valuemin={1}
        aria-valuemax={10}
        aria-valuenow={score}
        className="relative h-2.5 rounded-full bg-oat"
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-700 ease-out-soft',
            categoryBg[category],
          )}
          style={{ width: `${score * 10}%` }}
        />
        <span
          aria-hidden
          className="absolute top-1/2 left-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink/35"
        />
      </div>
    </div>
  )
}

/** Three compact numbers for cards: taste · texture · appearance. */
export function MiniScores({
  scores,
  className,
}: {
  scores: Record<Category, number>
  className?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5 text-xs font-semibold', className)}>
      {(['taste', 'texture', 'appearance'] as const).map((c) => (
        <span key={c} className="inline-flex items-center gap-1" title={CATEGORY_META[c].label}>
          <span aria-hidden className={cn('size-1.5 rounded-full', categoryBg[c])} />
          <span className="sr-only">{CATEGORY_META[c].label}</span>
          <span className="text-ink-soft tabular-nums">{formatScore(scores[c])}</span>
        </span>
      ))}
    </span>
  )
}
