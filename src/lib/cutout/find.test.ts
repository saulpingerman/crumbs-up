import { describe, expect, it } from 'vitest'
import { USUAL_SPOT, type Colours } from './colour'
import { findCookie, judge, placesToLook, type Spotted } from './find'
import { refineMask, type Point, type RefinedMask } from './mask'

const W = 60
const H = 80

/**
 * A stand-in for the slow model: a photo described as regions, where looking
 * at a point returns the outline of whichever region the point is in.
 */
function scene(regions: Record<string, (x: number, y: number) => boolean>) {
  const names = Object.keys(regions)
  const at = (x: number, y: number) =>
    names.find((name) => regions[name]!(x / (W - 1), y / (H - 1))) ?? 'background'
  const looks: string[] = []
  const look = (point: Point): RefinedMask | null => {
    const here = at(Math.round(point.x * (W - 1)), Math.round(point.y * (H - 1)))
    looks.push(here)
    const confidence = new Float32Array(W * H)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) confidence[y * W + x] = at(x, y) === here ? 0.95 : 0.02
    return refineMask(confidence, W, H, point)
  }
  return { look, looks }
}

/** Distances in a portrait frame, so discs come out round. */
const disc = (cx: number, cy: number, r: number) => (x: number, y: number) =>
  Math.hypot(x - cx, (y - cy) * (H / W)) <= r

/** What the colours say: where to look, and how baked whatever turns up is. */
const colours = (spot: Point | null, baked = 0.5): Colours => ({ spot, bakedIn: () => baked })

const thing = (label: string, score: number, x: number, y: number, width: number, height: number) =>
  ({ label, score, x, y, width, height }) satisfies Spotted

describe('where to look', () => {
  it('starts with what the spotter took for baked goods, surest first', () => {
    const seeds = placesToLook(
      [
        thing('person', 0.9, 0, 0.5, 0.3, 0.5),
        thing('cake', 0.3, 0.1, 0.1, 0.2, 0.2),
        thing('donut', 0.8, 0.2, 0.5, 0.4, 0.3),
        thing('sandwich', 0.2, 0.6, 0.6, 0.2, 0.2),
      ],
      { x: 0.3, y: 0.7 },
    )
    expect(seeds.map((seed) => seed.why)).toEqual([
      'spotted',
      'spotted',
      'colour',
      'usual',
      'middle',
    ])
    expect(seeds[0]!.point.x).toBeCloseTo(0.4)
    expect(seeds[0]!.point.y).toBeCloseTo(0.65)
    expect(seeds[1]!.point.x).toBeCloseTo(0.2)
    expect(seeds[3]!.point).toEqual(USUAL_SPOT)
  })

  it('ignores guesses, specks and whole-table "cakes"', () => {
    const seeds = placesToLook(
      [
        thing('donut', 0.05, 0.2, 0.5, 0.4, 0.3),
        thing('cake', 0.6, 0.5, 0.5, 0.05, 0.05),
        thing('cake', 0.6, 0, 0, 1, 0.98),
      ],
      null,
    )
    expect(seeds.map((seed) => seed.why)).toEqual(['usual', 'middle'])
  })
})

describe('judging what was found', () => {
  const cookie = scene({ cookie: disc(0.4, 0.6, 0.25) }).look({ x: 0.4, y: 0.6 })!

  it('accepts a cookie', () => {
    expect(judge(cookie, [])).toEqual({ cookie: true })
  })

  it('accepts a cookie held in a hand the spotter calls a person', () => {
    // The hand's box overlaps the cookie, but is not the same shape at all.
    expect(judge(cookie, [thing('person', 0.8, 0, 0.6, 0.35, 0.4)])).toEqual({ cookie: true })
  })

  it('rejects a person cut out whole', () => {
    const { look } = scene({ person: (x, y) => x > 0.2 && x < 0.7 && y > 0.05 && y < 0.98 })
    const person = look({ x: 0.45, y: 0.5 })!
    expect(judge(person, [])).toEqual({ cookie: true }) // nothing to tell it apart by shape…
    expect(judge(person, [thing('person', 0.93, 0.19, 0.04, 0.52, 0.95)])).toEqual({
      cookie: false,
    }) // …until the spotter says who it is.
  })

  it('rejects a floor that wraps around other things', () => {
    const { look } = scene({
      floor: (x, y) => (x < 0.25 && y > 0.1) || (y > 0.75 && x < 0.95),
    })
    expect(judge(look({ x: 0.1, y: 0.4 })!, [])).toEqual({ cookie: false, backdrop: true })
  })

  it('rejects a wrapper, and points at the cookie-shaped gap in it', () => {
    const cookieOnPaper = disc(0.45, 0.55, 0.16)
    const { look } = scene({
      cookie: cookieOnPaper,
      paper: (x, y) => disc(0.42, 0.55, 0.36)(x, y) && !cookieOnPaper(x, y),
    })
    const verdict = judge(look({ x: 0.15, y: 0.55 })!, [])
    expect(verdict.cookie).toBe(false)
    const instead = (verdict as { lookInstead?: Point }).lookInstead!
    expect(instead.x).toBeCloseTo(0.45, 1)
    expect(instead.y).toBeCloseTo(0.55, 1)
  })

  it('rejects the tabletop', () => {
    const { look } = scene({ table: () => true })
    // Filling the whole frame it isn't even a shape; nearly all of it is still too much.
    expect(look({ x: 0.5, y: 0.5 })).toBeNull()
    const most = scene({ table: (x, y) => x > 0.1 && y > 0.1 }).look({ x: 0.5, y: 0.5 })!
    expect(judge(most, [])).toEqual({ cookie: false, backdrop: true })
  })

  describe('when it was only a guess that led there', () => {
    it('still accepts a cookie sitting inside the frame', () => {
      expect(judge(cookie, [], 'colour', 0.4)).toEqual({ cookie: true })
      expect(judge(cookie, [], 'usual', 0.4)).toEqual({ cookie: true })
    })

    it('rejects a white label, however neat its shape', () => {
      const label = scene({ label: (x, y) => x > 0.4 && x < 0.75 && y > 0.58 && y < 0.85 })
      const found = label.look({ x: 0.5, y: 0.7 })!
      expect(judge(found, [], 'usual', 0)).toEqual({ cookie: false })
      // (Pointed out by the spotter, colour isn't held against it: frosting is white too.)
      expect(judge(found, [], 'spotted', 0)).toEqual({ cookie: true })
    })

    it('rejects a neat corner of table that runs out of the frame', () => {
      const table = scene({ table: (x, y) => x < 0.45 && y > 0.5 && y < 0.72 })
      const found = table.look({ x: 0.2, y: 0.6 })!
      expect(found.solidity).toBeGreaterThan(0.95)
      expect(judge(found, [], 'colour', 0.9)).toEqual({ cookie: false, backdrop: true })
    })
  })
})

describe('finding the cookie', () => {
  it('goes straight to what the spotter found', () => {
    const { look, looks } = scene({ cookie: disc(0.3, 0.75, 0.2) })
    const found = findCookie(
      [thing('donut', 0.7, 0.1, 0.6, 0.4, 0.3)],
      colours({ x: 0.5, y: 0.2 }),
      look,
    )
    expect(found).not.toBeNull()
    expect(looks).toEqual(['cookie'])
  })

  it('finds a cookie low in the frame by its colour when the spotter saw nothing', () => {
    const { look, looks } = scene({
      cookie: disc(0.6, 0.86, 0.14),
      pavement: (_x, y) => y > 0.45 && y < 0.7,
    })
    const found = findCookie([], colours({ x: 0.6, y: 0.85 }), look)!
    expect(looks).toEqual(['cookie'])
    expect(found.box.y / H).toBeGreaterThan(0.6)
  })

  it('moves on from the floor to the usual spot', () => {
    const { look, looks } = scene({
      cookie: disc(0.4, 0.62, 0.15),
      floor: (x, y) => (x > 0.7 && y > 0.1) || (y > 0.85 && x > 0.1),
    })
    // The colour guess lands on the (brown) floor.
    const found = findCookie([], colours({ x: 0.85, y: 0.5 }), look)
    expect(looks).toEqual(['floor', 'cookie'])
    expect(found).not.toBeNull()
  })

  it('looks in the gap when it finds the wrapper first', () => {
    const cookie = disc(0.36, 0.72, 0.13)
    const { look, looks } = scene({
      cookie,
      paper: (x, y) => disc(0.42, 0.66, 0.36)(x, y) && !cookie(x, y),
    })
    const found = findCookie([], null, look)!
    expect(looks).toEqual(['paper', 'cookie'])
    expect(found.box.width / W).toBeLessThan(0.35)
  })

  it('leaves the photo alone when the only thing in the usual spot is a label', () => {
    const { look, looks } = scene({
      label: (x, y) => x > 0.3 && x < 0.65 && y > 0.5 && y < 0.75,
    })
    expect(findCookie([], colours(null, 0), look)).toBeNull()
    // The usual spot and the middle are both on the label; it is only looked at once.
    expect(looks).toEqual(['label'])
  })

  it('tries the middle last, for a cookie the guesses missed', () => {
    const { look, looks } = scene({
      cookie: disc(0.5, 0.44, 0.13),
      counter: (x, y) => (y < 0.2 && x > 0.1) || (x < 0.2 && y > 0.1 && y < 0.5),
      label: (x, y) => x > 0.3 && x < 0.65 && y > 0.56 && y < 0.8,
    })
    // Colour points at the (brown) counter; the usual spot has a label on it.
    const baked = (shape: { alpha: Uint8ClampedArray; width: number }) =>
      shape.alpha[Math.round(0.68 * 79) * shape.width + Math.round(0.45 * 59)]! > 0 ? 0 : 0.5
    const found = findCookie([], { spot: { x: 0.5, y: 0.1 }, bakedIn: baked }, look)
    expect(looks).toEqual(['counter', 'label', 'cookie'])
    expect(found).not.toBeNull()
  })

  it('does not look twice at something it has ruled out', () => {
    const { look, looks } = scene({
      person: (x, y) => x > 0.15 && x < 0.72 && y > 0.05 && y < 0.99,
    })
    // Both guesses, and the usual spot, are on the person.
    const found = findCookie(
      [thing('person', 0.93, 0.14, 0.05, 0.58, 0.94)],
      colours({ x: 0.3, y: 0.6 }),
      look,
    )
    expect(found).toBeNull()
    expect(looks).toEqual(['person'])
  })

  it('still looks for a cookie lying on a backdrop it has ruled out', () => {
    // From the counter, the model returns the whole bag, cookie and all…
    const whole = scene({ bag: (x, y) => x > 0.12 && y > 0.04 })
    // …but from a spot on the cookie itself, just the cookie.
    const cookie = disc(0.5, 0.5, 0.14)
    const apart = scene({ cookie, bag: (x, y) => x > 0.12 && y > 0.04 && !cookie(x, y) })
    const look = (point: Point) => (cookie(point.x, point.y) ? apart : whole).look(point)
    const found = findCookie([], colours({ x: 0.5, y: 0.15 }), look)!
    expect([...whole.looks, ...apart.looks]).toEqual(['bag', 'bag', 'cookie'])
    expect(found.box.width / W).toBeLessThan(0.4)
  })

  it('gives up after three looks rather than keep someone waiting', () => {
    const { look, looks } = scene({
      a: (x, y) => (x < 0.3 && y < 0.5) || (y < 0.12 && x < 0.6),
      b: (x, y) => (x > 0.6 && y > 0.1 && y < 0.5) || (y > 0.4 && y < 0.5 && x > 0.35),
      c: (x, y) => (y > 0.55 && x < 0.55 && x > 0.3) || (y > 0.9 && x < 0.9),
    })
    const found = findCookie(
      [thing('cake', 0.5, 0.1, 0.2, 0.2, 0.2), thing('donut', 0.4, 0.7, 0.2, 0.2, 0.2)],
      colours({ x: 0.8, y: 0.8 }),
      look,
    )
    expect(found).toBeNull()
    expect(looks.length).toBe(3)
  })
})
