import { useId, useState } from 'react'
import { Crumbs } from '@/components/Crumbs'
import { scatter } from '@/components/scatter'
import { cn } from '@/lib/cn'

/* The logo's cookie, in the logo's own 512-unit box. */
const CENTRE = { x: 246, y: 270 }
const RADIUS = 208

/**
 * Where the eaten edge stands after each bite, as an x position in the box.
 * The cookie is eaten from the right — the side the logo's own bite is on —
 * across to the left, and the last bite finishes it.
 */
const FRONTS = [368, 292, 216, 138]
/** Bites it takes to eat the whole thing: one per front, and one for the rest. */
const BITES = FRONTS.length + 1

/** Tooth marks down an eaten edge: a column of overlapping round bites. */
function toothMarks(front: number) {
  return [84, 168, 252, 336, 420, 500].map((cy, i) => ({
    cx: front + (i % 2 === 0 ? 30 : 18),
    cy,
    r: 54,
  }))
}

/** Crumbs knocked off by each bite, thrown out over the side already eaten. */
const BITE_CRUMBS = Array.from({ length: BITES }, (_, i) =>
  scatter(7, { seed: 21 + i, reach: [18, 52], from: -75, to: 55, size: [4, 8] }),
)

/** What's left on the table once it's gone. */
const LEFTOVERS = [
  { cx: 190, cy: 396, r: 19 },
  { cx: 262, cy: 424, r: 13 },
  { cx: 326, cy: 388, r: 16 },
  { cx: 232, cy: 348, r: 10 },
  { cx: 140, cy: 432, r: 12 },
  { cx: 296, cy: 332, r: 9 },
]

/**
 * The welcome screen's cookie. It bobs, and each tap takes another bite out
 * of it, from one side across to the other, until only crumbs are left; the
 * tap after that bakes a fresh one. A toy, so it stays out of the way of
 * keyboards and screen readers.
 */
export function BiteableCookie({ className }: { className?: string }) {
  const id = useId()
  const [taps, setTaps] = useState(0)
  const bites = taps % (BITES + 1)
  const fresh = taps > 0 && bites === 0
  const gone = bites === BITES
  const front = bites > 0 && !gone ? FRONTS[bites - 1]! : null
  // Each bite's crumbs fly from the edge it has just made.
  const edge = gone ? 90 : (front ?? 0)

  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden
      data-bites={bites}
      onClick={() => setTaps((n) => n + 1)}
      className={cn(
        'relative block animate-bob cursor-pointer touch-manipulation rounded-full select-none focus:outline-none',
        className,
      )}
    >
      <svg
        // A new element each time, so the nibble plays again.
        key={`cookie-${taps}`}
        viewBox="0 0 512 512"
        className={cn('block size-full', bites > 0 && 'animate-chomp', fresh && 'animate-pop')}
      >
        <defs>
          <radialGradient id={`${id}-dough`} cx="38%" cy="32%" r="80%">
            <stop offset="0" stopColor="#f5d39a" />
            <stop offset=".6" stopColor="#e0aa63" />
            <stop offset="1" stopColor="#c48442" />
          </radialGradient>
          <mask id={`${id}-bite`}>
            <rect width="512" height="512" fill="#fff" />
            <circle cx="404" cy="124" r="64" />
            <circle cx="334" cy="74" r="40" />
            <circle cx="456" cy="194" r="38" />
            {front !== null && (
              <>
                <rect x={front + 24} width={512} height="512" />
                {toothMarks(front).map((mark) => (
                  <circle key={mark.cy} {...mark} />
                ))}
              </>
            )}
          </mask>
        </defs>
        {!gone && (
          <g mask={`url(#${id}-bite)`}>
            <circle cx={CENTRE.x} cy={CENTRE.y} r={RADIUS} fill={`url(#${id}-dough)`} />
            <circle
              cx={CENTRE.x}
              cy={CENTRE.y}
              r="200"
              fill="none"
              stroke="#a9692f"
              strokeOpacity=".28"
              strokeWidth="16"
            />
            <g fill="#3a2012">
              <ellipse cx="168" cy="186" rx="30" ry="25" transform="rotate(-18 168 186)" />
              <ellipse cx="282" cy="176" rx="23" ry="20" transform="rotate(24 282 176)" />
              <ellipse cx="118" cy="296" rx="24" ry="21" transform="rotate(12 118 296)" />
              <ellipse cx="232" cy="292" rx="33" ry="27" transform="rotate(-10 232 292)" />
              <ellipse cx="352" cy="282" rx="26" ry="22" transform="rotate(30 352 282)" />
              <ellipse cx="190" cy="398" rx="27" ry="22" transform="rotate(-24 190 398)" />
              <ellipse cx="318" cy="390" rx="30" ry="24" transform="rotate(14 318 390)" />
            </g>
            <g fill="#fff" fillOpacity=".22">
              <ellipse cx="160" cy="178" rx="10" ry="6" transform="rotate(-18 160 178)" />
              <ellipse cx="224" cy="283" rx="11" ry="6" transform="rotate(-10 224 283)" />
              <ellipse cx="311" cy="382" rx="10" ry="6" transform="rotate(14 311 382)" />
            </g>
          </g>
        )}
        {/* The logo's own crumbs, until the side they sit beside is eaten. */}
        {bites === 0 && (
          <g fill="#e0aa63">
            <circle cx="418" cy="96" r="15" />
            <circle cx="466" cy="52" r="10" />
            <circle cx="378" cy="40" r="9" />
          </g>
        )}
        {gone && (
          <g>
            {LEFTOVERS.map((crumb, i) => (
              <circle key={i} {...crumb} fill={i % 3 === 0 ? '#3a2012' : '#e0aa63'} />
            ))}
          </g>
        )}
      </svg>
      {bites > 0 && (
        <Crumbs
          key={`crumbs-${taps}`}
          crumbs={BITE_CRUMBS[bites - 1]!}
          duration={750}
          style={{ left: `${(edge / 512) * 100}%`, top: '56%' }}
        />
      )}
    </button>
  )
}
