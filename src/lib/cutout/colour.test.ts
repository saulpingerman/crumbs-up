import { describe, expect, it } from 'vitest'
import { bakedness, readColours } from './colour'

const W = 96
const H = 128

type Colour = [number, number, number]
const GREY: Colour = [128, 130, 133]
const GOLDEN: Colour = [190, 130, 60]

/** A small photo: a background with coloured discs on it (positions 0–1). */
function photo(background: Colour, discs: [x: number, y: number, r: number, colour: Colour][]) {
  const rgba = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const disc = discs.find(([cx, cy, r]) => Math.hypot(x / W - cx, (y / H - cy) * (H / W)) <= r)
      const [r, g, b] = disc ? disc[3] : background
      rgba.set([r, g, b, 255], (y * W + x) * 4)
    }
  }
  return rgba
}

describe('bakedness', () => {
  it('is high for the browns and golds of a baked cookie', () => {
    expect(bakedness(...GOLDEN)).toBeGreaterThan(0.7)
    expect(bakedness(150, 95, 50)).toBeGreaterThan(0.6)
  })

  it('is nothing for plates, pavements, sky and shadow', () => {
    expect(bakedness(245, 245, 245)).toBe(0)
    expect(bakedness(...GREY)).toBe(0)
    expect(bakedness(60, 110, 200)).toBeLessThan(0.01)
    expect(bakedness(12, 8, 5)).toBeLessThan(0.05)
  })
})

/** Where the colours say to look. */
const colourSpot = (rgba: Uint8ClampedArray, width: number, height: number) =>
  readColours(rgba, width, height).spot

describe('where the colours point', () => {
  it('lands on the cookie, wherever in the frame it is', () => {
    const lowLeft = colourSpot(photo(GREY, [[0.3, 0.75, 0.18, GOLDEN]]), W, H)!
    expect(Math.hypot(lowLeft.x - 0.3, lowLeft.y - 0.75)).toBeLessThan(0.15)
    const bottom = colourSpot(photo(GREY, [[0.6, 0.86, 0.15, GOLDEN]]), W, H)!
    expect(Math.hypot(bottom.x - 0.6, bottom.y - 0.86)).toBeLessThan(0.15)
  })

  it('prefers the one where cookies usually are over a lookalike in the corner', () => {
    const spot = colourSpot(
      photo(GREY, [
        [0.85, 0.08, 0.14, GOLDEN],
        [0.4, 0.65, 0.14, GOLDEN],
      ]),
      W,
      H,
    )!
    expect(Math.hypot(spot.x - 0.4, spot.y - 0.65)).toBeLessThan(0.15)
  })

  it('has nothing to offer when no part of the photo is cookie-coloured', () => {
    expect(colourSpot(photo(GREY, [[0.5, 0.5, 0.2, [40, 40, 45]]]), W, H)).toBeNull()
    expect(colourSpot(new Uint8ClampedArray(0), 0, 0)).toBeNull()
  })
})

describe('how baked a shape looks', () => {
  /** A shape covering a disc of the photo, at a finer grain than the colours. */
  function shape(cx: number, cy: number, r: number) {
    const width = W * 4
    const height = H * 4
    const alpha = new Uint8ClampedArray(width * height)
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        if (Math.hypot(x / width - cx, (y / height - cy) * (H / W)) <= r) alpha[y * width + x] = 255
    return { width, height, alpha }
  }
  const colours = readColours(
    photo(GREY, [
      [0.3, 0.7, 0.18, GOLDEN],
      [0.7, 0.25, 0.15, [250, 250, 250]],
    ]),
    W,
    H,
  )

  it('is high inside a cookie', () => {
    expect(colours.bakedIn(shape(0.3, 0.7, 0.15))).toBeGreaterThan(0.7)
  })

  it('is nothing inside a white label or on the grey table', () => {
    expect(colours.bakedIn(shape(0.7, 0.25, 0.12))).toBeLessThan(0.01)
    expect(colours.bakedIn(shape(0.75, 0.8, 0.1))).toBeLessThan(0.01)
  })

  it('is nothing for an empty shape', () => {
    expect(colours.bakedIn(shape(0.5, 0.5, 0))).toBe(0)
  })
})
