import { describe, expect, it } from 'vitest'
import { refineMask } from './mask'

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
