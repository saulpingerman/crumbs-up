/** One flying crumb: where it goes, how it tumbles, what it looks like. */
export interface Crumb {
  /** How far sideways it ends up, in pixels. */
  dx: number
  /** How far it rises before it starts to fall (negative is up). */
  up: number
  /** How far it drops after that. */
  fall: number
  spin: number
  size: number
  squash: number
  /** Milliseconds it hangs back, so they don't all leave at once. */
  wait: number
  shade: string
  round: string
}

const SHADES = [
  'var(--baked-2)',
  'var(--baked-1)',
  'var(--baked-2)',
  'var(--crust)',
  'var(--baked-ink)',
]
const ROUNDS = ['45% 55% 50% 50%', '50% 40% 55% 45%', '38% 62% 45% 55%', '50%']

/** Small, fast, good-enough random numbers that come out the same every time. */
function shuffler(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Scatter {
  /** Same seed, same crumbs — nothing here changes between renders. */
  seed?: number
  /** Nearest and furthest a crumb is thrown, in pixels. */
  reach: [number, number]
  /** The fan they are thrown across, in degrees: 0 is right, 90 is straight up. */
  from?: number
  to?: number
  /** Smallest and largest crumb, in pixels. */
  size?: [number, number]
}

/** Lay out `count` crumbs thrown across a fan, evenly but not tidily. */
export function scatter(
  count: number,
  { seed = 1, reach, from = 0, to = 360, size = [5, 10] }: Scatter,
): Crumb[] {
  const random = shuffler(seed)
  const between = (low: number, high: number) => low + (high - low) * random()
  const wholeTurn = to - from >= 360
  const step = (to - from) / (wholeTurn ? count : Math.max(1, count - 1))
  return Array.from({ length: count }, (_, i) => {
    const angle = ((from + step * i + between(-0.35, 0.35) * step) * Math.PI) / 180
    const distance = between(reach[0], reach[1])
    return {
      dx: Math.round(distance * Math.cos(angle)),
      up: Math.round(-distance * Math.sin(angle)),
      fall: Math.round(between(0.3, 0.6) * reach[1]),
      spin: Math.round(between(140, 420)) * (random() < 0.5 ? -1 : 1),
      size: Math.round(between(size[0], size[1])),
      squash: between(0.7, 1),
      wait: Math.round(between(0, 90)),
      shade: SHADES[Math.floor(random() * SHADES.length)]!,
      round: ROUNDS[Math.floor(random() * ROUNDS.length)]!,
    }
  })
}
