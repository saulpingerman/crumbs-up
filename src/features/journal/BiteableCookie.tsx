import { useId, useState } from 'react'
import { Crumbs } from '@/components/Crumbs'
import { scatter } from '@/components/scatter'
import { cn } from '@/lib/cn'

/* The logo's cookie, in the logo's own 512-unit box. */
const CENTRE = { x: 246, y: 270 }
const RADIUS = 208

interface Bite {
  /** Circles cut out of the cookie: one mouthful and a tooth mark either side. */
  cuts: { cx: number; cy: number; r: number }[]
  /** Where on the cookie the bite lands, as a share of the box. */
  at: { left: string; top: string }
  /** Which way is "out of the cookie" from there: 0 is right, 90 is up. */
  outward: number
}

/** A bite taken at a point on the rim. Degrees run clockwise from the right. */
function biteAt(degrees: number): Bite {
  const onRim = (offset: number, distance: number) => {
    const angle = ((degrees + offset) * Math.PI) / 180
    return { cx: CENTRE.x + distance * Math.cos(angle), cy: CENTRE.y + distance * Math.sin(angle) }
  }
  const middle = onRim(0, RADIUS - 24)
  return {
    cuts: [
      { ...onRim(0, RADIUS + 6), r: 64 },
      { ...onRim(-23, RADIUS + 10), r: 40 },
      { ...onRim(23, RADIUS + 10), r: 38 },
    ],
    at: { left: `${(middle.cx / 512) * 100}%`, top: `${(middle.cy / 512) * 100}%` },
    outward: -degrees,
  }
}

/** The bites still to be had, in the order they are taken. The logo comes with one. */
const BITES = [biteAt(-142), biteAt(48), biteAt(142)]

const CRUMBS = BITES.map((bite, i) =>
  scatter(6, {
    seed: 11 + i,
    reach: [16, 46],
    from: bite.outward - 55,
    to: bite.outward + 55,
    size: [4, 8],
  }),
)

/**
 * The welcome screen's cookie. It bobs, and anyone who taps it gets to take a
 * bite; once it's mostly gone, the next tap bakes a fresh one. A toy, so it
 * stays out of the way of keyboards and screen readers.
 */
export function BiteableCookie({ className }: { className?: string }) {
  const id = useId()
  const [taps, setTaps] = useState(0)
  const bites = taps % (BITES.length + 1)
  const fresh = taps > 0 && bites === 0

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
            {BITES.slice(0, bites).flatMap((bite, b) =>
              bite.cuts.map((cut, c) => <circle key={`${b}-${c}`} {...cut} />),
            )}
          </mask>
        </defs>
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
        <g fill="#e0aa63">
          <circle cx="418" cy="96" r="15" />
          <circle cx="466" cy="52" r="10" />
          <circle cx="378" cy="40" r="9" />
        </g>
      </svg>
      {bites > 0 && (
        <Crumbs
          key={`crumbs-${taps}`}
          crumbs={CRUMBS[bites - 1]!}
          duration={750}
          style={BITES[bites - 1]!.at}
        />
      )}
    </button>
  )
}
