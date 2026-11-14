import { describe, expect, it } from 'vitest'
import { keepWithin, middleOf, refineMask } from './mask'

const W = 40
const H = 30

/** A confidence map with 0.95 inside each disc and 0.02 elsewhere. */
function scene(
  discs: [cx: number, cy: number, r: number][],
  holes: [number, number, number][] = [],
) {
  const mask = new Float32Array(W * H).fill(0.02)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (discs.some(([cx, cy, r]) => Math.hypot(x - cx, y - cy) <= r)) mask[y * W + x] = 0.95
      if (holes.some(([cx, cy, r]) => Math.hypot(x - cx, y - cy) <= r)) mask[y * W + x] = 0.02
    }
  }
  return mask
}

describe('refineMask', () => {
  it('finds the shape under the tap and its bounds', () => {
    const result = refineMask(scene([[20, 15, 8]]), W, H, { x: 0.5, y: 0.5 })
    expect(result).not.toBeNull()
    expect(result!.box).toEqual({ x: 12, y: 7, width: 17, height: 17 })
    expect(result!.coverage).toBeGreaterThan(0.1)
    expect(result!.alpha[15 * W + 20]).toBe(255)
    expect(result!.alpha[0]).toBe(0)
  })

  it('keeps only the tapped shape when there are several', () => {
    const two = scene([
      [9, 15, 6],
      [30, 15, 6],
    ])
    const left = refineMask(two, W, H, { x: 9 / (W - 1), y: 0.5 })!
    expect(left.box.x + left.box.width).toBeLessThan(20)
    expect(left.alpha[15 * W + 30]).toBe(0)

    const right = refineMask(two, W, H, { x: 30 / (W - 1), y: 0.5 })!
    expect(right.box.x).toBeGreaterThan(20)
  })

  it('fills holes inside the shape', () => {
    const holed = scene([[20, 15, 9]], [[20, 15, 1]])
    const result = refineMask(holed, W, H, { x: 0.3, y: 0.5 })!
    expect(result.alpha[15 * W + 20]).toBe(255)
  })

  it('leaves big enclosed gaps open', () => {
    // A ring: the middle is plate, not cookie.
    const ring = scene([[20, 15, 12]], [[20, 15, 7]])
    const result = refineMask(ring, W, H, { x: 10 / (W - 1), y: 0.5 })!
    expect(result.alpha[15 * W + 20]).toBe(0)
    expect(result.alpha[15 * W + 10]).toBe(255)
  })

  it('snaps a near miss onto the shape', () => {
    // Tap lands just outside a disc's edge.
    const result = refineMask(scene([[20, 15, 6]]), W, H, { x: 28 / (W - 1), y: 0.5 })
    expect(result).not.toBeNull()
  })

  it('gives up when the tap is nowhere near anything', () => {
    expect(refineMask(scene([[5, 5, 3]]), W, H, { x: 0.95, y: 0.95 })).toBeNull()
  })

  it('rejects specks and whole-frame masks', () => {
    expect(refineMask(scene([[20, 15, 1]]), W, H, { x: 0.5, y: 0.5 })).toBeNull()
    expect(refineMask(new Float32Array(W * H).fill(0.99), W, H, { x: 0.5, y: 0.5 })).toBeNull()
  })

  it('rejects a mask whose size does not match', () => {
    expect(refineMask(new Float32Array(10), W, H, { x: 0.5, y: 0.5 })).toBeNull()
  })
})

describe('the shape of what was found', () => {
  /** A confidence map that is 0.95 wherever `inside` says so. */
  function drawn(inside: (x: number, y: number) => boolean) {
    const mask = new Float32Array(W * H).fill(0.02)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inside(x, y)) mask[y * W + x] = 0.95
    return mask
  }

  it('calls a disc solid and gapless', () => {
    // (A disc this small is all staircase; real masks are far finer and score higher.)
    const disc = refineMask(scene([[20, 15, 9]]), W, H, { x: 0.5, y: 0.5 })!
    expect(disc.solidity).toBeGreaterThan(0.9)
    expect(disc.gap).toBeNull()
  })

  it('calls a filled rectangle exactly solid', () => {
    const block = refineMask(
      drawn((x, y) => x >= 8 && x < 30 && y >= 6 && y < 22),
      W,
      H,
      { x: 0.5, y: 0.5 },
    )!
    expect(block.solidity).toBeCloseTo(1, 5)
  })

  it('sees that an L-shaped floor is not one solid thing', () => {
    // Two arms of a floor around a piece of furniture.
    const floor = refineMask(
      drawn(
        (x, y) => (x >= 4 && x < 12 && y >= 2 && y < 28) || (y >= 20 && y < 28 && x >= 4 && x < 36),
      ),
      W,
      H,
      { x: 6 / (W - 1), y: 10 / (H - 1) },
    )!
    expect(floor.solidity).toBeLessThan(0.7)
  })

  it('reports the cookie-sized gap in a wrapper, and where it is', () => {
    // A big disc (the wrapper) with a smaller disc missing off-centre (the cookie).
    const wrapper = refineMask(scene([[20, 15, 13]], [[24, 13, 6]]), W, H, {
      x: 10 / (W - 1),
      y: 0.5,
    })!
    expect(wrapper.gap).not.toBeNull()
    expect(wrapper.gap!.share).toBeGreaterThan(0.15)
    expect(wrapper.gap!.center.x).toBeCloseTo(24 / (W - 1), 1)
    expect(wrapper.gap!.center.y).toBeCloseTo(13 / (H - 1), 1)
    // The outline is still a clean disc.
    expect(wrapper.solidity).toBeGreaterThan(0.9)
  })
})

describe('a loop drawn around the cookie', () => {
  /** A rough circle, as a thumb would draw it (positions 0–1). */
  const loop = (cx: number, cy: number, r: number) =>
    Array.from({ length: 16 }, (_, i) => {
      const angle = (i / 16) * Math.PI * 2
      const wobble = 1 + 0.1 * Math.sin(i * 2.3)
      return {
        x: cx + (r * wobble * Math.cos(angle)) / (W - 1),
        y: cy + (r * wobble * Math.sin(angle)) / (H - 1),
      }
    })

  it('has its middle where the cookie is', () => {
    const middle = middleOf(loop(0.3, 0.6, 7))
    expect(middle.x).toBeCloseTo(0.3, 1)
    expect(middle.y).toBeCloseTo(0.6, 1)
  })

  it('still has a middle when it is only a line', () => {
    const middle = middleOf([
      { x: 0.2, y: 0.2 },
      { x: 0.4, y: 0.4 },
      { x: 0.6, y: 0.6 },
    ])
    expect(middle.x).toBeCloseTo(0.4)
    expect(middle.y).toBeCloseTo(0.4)
  })

  it('trims away the wrapper the cookie was sitting on', () => {
    // The model returned cookie and wrapper as one wide shape…
    const wide = refineMask(
      scene([
        [12, 15, 7],
        [22, 15, 9],
      ]),
      W,
      H,
      { x: 12 / (W - 1), y: 0.5 },
    )!
    expect(wide.box.width).toBeGreaterThan(25)
    // …and the loop was drawn around the cookie on the left.
    const trimmed = keepWithin(wide, loop(12 / (W - 1), 15 / (H - 1), 8))!
    expect(trimmed.box.x + trimmed.box.width).toBeLessThan(24)
    expect(trimmed.alpha[15 * W + 12]).toBe(255)
    expect(trimmed.alpha[15 * W + 29]).toBe(0)
    expect(trimmed.coverage).toBeLessThan(wide.coverage)
  })

  it('leaves a shape alone when the loop goes right round it', () => {
    const cookie = refineMask(scene([[20, 15, 7]]), W, H, { x: 0.5, y: 0.5 })!
    const kept = keepWithin(cookie, loop(20 / (W - 1), 15 / (H - 1), 9))!
    expect(kept.coverage).toBeCloseTo(cookie.coverage, 5)
    expect(kept.box).toEqual(cookie.box)
  })

  it('says so when the loop misses the shape altogether', () => {
    const cookie = refineMask(scene([[10, 10, 6]]), W, H, { x: 10 / (W - 1), y: 10 / (H - 1) })!
    expect(keepWithin(cookie, loop(32 / (W - 1), 22 / (H - 1), 4))).toBeNull()
  })
})
