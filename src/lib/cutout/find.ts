/**
 * Finds the cookie in a photo nobody has pointed at.
 *
 * People rarely put the cookie in the middle: it is held out in one hand,
 * or sits low in the frame with the bakery behind it. Looking at the photo
 * properly (see `worker.ts`) is slow, so this decides *where* to look using
 * cheap hints, and then judges whether what turned up is a cookie at all —
 * the alternative being a neatly cut-out piece of floor.
 *
 * Pure decisions only; the looking itself is handed in as a function.
 */
import { USUAL_SPOT, type Colours } from './colour'
import type { Point, RefinedMask } from './mask'

/** Something the object spotter recognised. Positions are 0–1 across the photo. */
export interface Spotted {
  label: string
  /** How sure the spotter is, 0–1. */
  score: number
  x: number
  y: number
  width: number
  height: number
}

export interface Seed {
  point: Point
  why: 'spotted' | 'colour' | 'usual' | 'middle' | 'gap'
}

/**
 * The spotter is a general-purpose one that was never taught the word
 * "cookie". It reliably files them under one of these instead, which is all
 * that's needed: where it is, not what it's called.
 */
const COOKIE_LOOKALIKES = new Set([
  'donut',
  'cake',
  'sandwich',
  'pizza',
  'hot dog',
  'apple',
  'orange',
])
/** Things that are sometimes holding the cookie, or watching it closely. */
const NEVER_A_COOKIE = new Set(['person', 'dog', 'cat'])

/** Below this the spotter is guessing. */
const MIN_SCORE = 0.1
/** A lookalike filling less of the photo than this is a crumb or a mistake… */
const MIN_AREA = 0.015
/** …and one filling more than this is the whole table. */
const MAX_AREA = 0.8
/** Each look takes a second or more on a phone; give up after this many. */
const MAX_LOOKS = 3

/** A cookie fills at least this much of its own convex outline. */
const MIN_SOLIDITY = 0.88
/** A gap this big inside the shape means the cookie is what's *in* the gap. */
const TELLING_GAP = 0.08
/** Unprompted, anything bigger than this is the table or the wall. */
const MAX_COVERAGE = 0.6
/** How sure the spotter must be that something is a person or a pet… */
const SURE_OF_BYSTANDER = 0.5
/**
 * …and how closely the shape must match them, to be ruled out as one. A hand
 * holding a cookie overlaps it by a third at most; a person cut out whole
 * matches their own outline almost exactly.
 */
const SAME_THING = 0.7
/**
 * The spotter's word is trusted; a guess from colour or habit is not, and
 * what it turns up has to pass two more checks. It must sit inside the
 * frame (tabletops and floors run out of it)…
 */
const MAX_ON_EDGE = 0.08
/** …and have some colour to it (labels, napkins, lids and plates don't). */
const MIN_BAKED = 0.03

const MIDDLE: Point = { x: 0.5, y: 0.5 }

/** Where to look, most promising first. */
export function placesToLook(spotted: Spotted[], colourSpot: Point | null): Seed[] {
  const lookalikes = spotted
    .filter((thing) => {
      const area = thing.width * thing.height
      return (
        COOKIE_LOOKALIKES.has(thing.label) &&
        thing.score >= MIN_SCORE &&
        area >= MIN_AREA &&
        area <= MAX_AREA
      )
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((thing): Seed => ({
      point: { x: thing.x + thing.width / 2, y: thing.y + thing.height / 2 },
      why: 'spotted',
    }))
  return [
    ...lookalikes,
    ...(colourSpot ? [{ point: colourSpot, why: 'colour' } as const] : []),
    { point: USUAL_SPOT, why: 'usual' },
    // Last, for the cookie laid flat and photographed square on.
    { point: MIDDLE, why: 'middle' },
  ]
}

function overlap(mask: RefinedMask, thing: Spotted): number {
  const ax = mask.box.x / mask.width
  const ay = mask.box.y / mask.height
  const aw = mask.box.width / mask.width
  const ah = mask.box.height / mask.height
  const w = Math.min(ax + aw, thing.x + thing.width) - Math.max(ax, thing.x)
  const h = Math.min(ay + ah, thing.y + thing.height) - Math.max(ay, thing.y)
  if (w <= 0 || h <= 0) return 0
  const shared = w * h
  return shared / (aw * ah + thing.width * thing.height - shared)
}

export type Verdict =
  | { cookie: true }
  | {
      cookie: false
      /** Where one might be instead: in the gap this shape has in it. */
      lookInstead?: Point
      /**
       * Set when this is something things sit *on* — a floor, a counter, a
       * bag — rather than a thing in itself. A cookie can still be lying on
       * a backdrop; another look at a thing only finds the thing again.
       */
      backdrop?: boolean
    }

/**
 * Could this shape be a cookie?
 *
 * @param why What led here; a guess is held to a higher standard.
 * @param baked How baked-looking the shape's colours are (see `Colours.bakedIn`).
 */
export function judge(
  mask: RefinedMask,
  spotted: Spotted[],
  why: Seed['why'] = 'spotted',
  baked = 1,
): Verdict {
  // A wrapper, box or plate with a hole in it: the cookie is the hole.
  if (mask.gap && mask.gap.share >= TELLING_GAP) {
    return { cookie: false, lookInstead: mask.gap.center }
  }
  if (mask.coverage > MAX_COVERAGE) return { cookie: false, backdrop: true }
  // Floors, pavements and ledges wrap around other things; cookies don't.
  if (mask.solidity < MIN_SOLIDITY) return { cookie: false, backdrop: true }
  const bystander = spotted.some(
    (thing) =>
      NEVER_A_COOKIE.has(thing.label) &&
      thing.score >= SURE_OF_BYSTANDER &&
      overlap(mask, thing) >= SAME_THING,
  )
  if (bystander) return { cookie: false }
  if (why !== 'spotted') {
    if (mask.onEdge > MAX_ON_EDGE) return { cookie: false, backdrop: true }
    if (baked < MIN_BAKED) return { cookie: false }
  }
  return { cookie: true }
}

function covers(mask: RefinedMask, point: Point): boolean {
  const x = Math.min(mask.width - 1, Math.max(0, Math.round(point.x * (mask.width - 1))))
  const y = Math.min(mask.height - 1, Math.max(0, Math.round(point.y * (mask.height - 1))))
  return mask.alpha[y * mask.width + x]! > 0
}

/**
 * Look for the cookie, trying the most promising places first.
 *
 * @param colours What the photo's colours have to say, if they could be read.
 * @param look Cuts out whatever is at a point (slow), or null if nothing is.
 * @returns the cookie's shape, or null if nothing convincing was found —
 *   in which case the photo is better left alone than cut wrongly.
 */
export function findCookie(
  spotted: Spotted[],
  colours: Colours | null,
  look: (point: Point) => RefinedMask | null,
): RefinedMask | null {
  const queue = placesToLook(spotted, colours?.spot ?? null)
  /** Things (not backdrops) already ruled out. */
  const ruledOut: RefinedMask[] = []
  let looks = 0
  while (queue.length > 0 && looks < MAX_LOOKS) {
    const seed = queue.shift()!
    // A spot on a thing already ruled out would only find it again.
    if (ruledOut.some((mask) => covers(mask, seed.point))) continue
    looks++
    const mask = look(seed.point)
    if (!mask) continue
    const verdict = judge(mask, spotted, seed.why, colours?.bakedIn(mask))
    if (verdict.cookie) return mask
    if (!verdict.backdrop) ruledOut.push(mask)
    if (verdict.lookInstead && seed.why !== 'gap') {
      // Whatever is sitting on something found by the spotter inherits its trust.
      queue.unshift({ point: verdict.lookInstead, why: seed.why === 'spotted' ? 'spotted' : 'gap' })
    }
  }
  return null
}
