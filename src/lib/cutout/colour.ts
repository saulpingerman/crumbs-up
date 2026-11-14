/**
 * A guess at where the cookie is, from colour alone.
 *
 * Baked things are brown and gold, and people tend to hold them a little
 * below and to the left of the middle of the frame. Neither is reliable on
 * its own — floors are brown too — so this is only a place to look first
 * when nothing was recognised outright; what's found there is still judged.
 */
import type { Point } from './mask'

/** Photos are shrunk to this on the long edge before being read. */
export const COLOUR_EDGE = 128

/** A cookie held out in the left hand usually ends up about here. */
export const USUAL_SPOT: Point = { x: 0.45, y: 0.62 }

/** Less "baked colour" than this at the best spot and there's nothing to go on. */
const TOO_FAINT = 0.05

function gaussian(sigma: number): Float32Array {
  const radius = Math.ceil(sigma * 3)
  const kernel = new Float32Array(radius * 2 + 1)
  let sum = 0
  for (let i = -radius; i <= radius; i++) {
    kernel[i + radius] = Math.exp(-(i * i) / (2 * sigma * sigma))
    sum += kernel[i + radius]!
  }
  for (let i = 0; i < kernel.length; i++) kernel[i]! /= sum
  return kernel
}

function blur(values: Float32Array, width: number, height: number, sigma: number): Float32Array {
  const kernel = gaussian(sigma)
  const radius = (kernel.length - 1) / 2
  const across = new Float32Array(values.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0
      for (let k = -radius; k <= radius; k++) {
        const xx = Math.min(width - 1, Math.max(0, x + k))
        sum += values[y * width + xx]! * kernel[k + radius]!
      }
      across[y * width + x] = sum
    }
  }
  const down = new Float32Array(values.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0
      for (let k = -radius; k <= radius; k++) {
        const yy = Math.min(height - 1, Math.max(0, y + k))
        sum += across[yy * width + x]! * kernel[k + radius]!
      }
      down[y * width + x] = sum
    }
  }
  return down
}

const ramp = (value: number, from: number, span: number) =>
  Math.min(1, Math.max(0, (value - from) / span))

/** How "baked" a colour is, 0–1: the browns and golds of crust and crumb. */
export function bakedness(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const value = max / 255
  const saturation = max === 0 ? 0 : (max - min) / max
  if (max === min) return 0
  let hue: number
  if (max === r) hue = ((g - b) / (max - min)) * 60
  else if (max === g) hue = (2 + (b - r) / (max - min)) * 60
  else hue = (4 + (r - g) / (max - min)) * 60
  if (hue < 0) hue += 360
  // Centred on golden brown; reds and yellows fall away either side.
  const tone = Math.exp(-(((hue - 28) / 16) ** 2))
  return (
    tone *
    ramp(saturation, 0.15, 0.35) *
    // Not so dark it's shadow, not so bright it's a blown-out highlight.
    ramp(value, 0.12, 0.3) *
    ramp(1.02 - value, 0, 0.2)
  )
}

export interface Colours {
  /**
   * The most cookie-coloured spot near where cookies usually are, or null
   * when the photo has no such colour to speak of.
   */
  spot: Point | null
  /** How baked-looking the inside of a shape is on average, 0–1. */
  bakedIn: (shape: { width: number; height: number; alpha: Uint8ClampedArray }) => number
}

/** @param rgba Pixels of a small copy of the photo (see `COLOUR_EDGE`). */
export function readColours(rgba: Uint8ClampedArray, width: number, height: number): Colours {
  if (width < 2 || height < 2 || rgba.length < width * height * 4) {
    return { spot: null, bakedIn: () => 0 }
  }
  const scale = Math.max(width, height) / COLOUR_EDGE
  const baked = new Float32Array(width * height)
  for (let i = 0; i < baked.length; i++) {
    baked[i] = bakedness(rgba[i * 4]!, rgba[i * 4 + 1]!, rgba[i * 4 + 2]!)
  }

  const smooth = blur(baked, width, height, 3 * scale)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x / (width - 1) - USUAL_SPOT.x) / 0.33
      const dy = (y / (height - 1) - 0.6) / 0.33
      smooth[y * width + x]! *= Math.exp(-dx * dx - dy * dy)
    }
  }
  const map = blur(smooth, width, height, 4 * scale)
  let best = 0
  for (let i = 1; i < map.length; i++) if (map[i]! > map[best]!) best = i
  const spot =
    map[best]! < TOO_FAINT
      ? null
      : { x: (best % width) / (width - 1), y: Math.floor(best / width) / (height - 1) }

  return {
    spot,
    bakedIn(shape) {
      // The shape is far finer than the colour copy; sample it at each colour pixel.
      let sum = 0
      let weight = 0
      for (let y = 0; y < height; y++) {
        const sy = Math.min(shape.height - 1, Math.floor(((y + 0.5) / height) * shape.height))
        for (let x = 0; x < width; x++) {
          const sx = Math.min(shape.width - 1, Math.floor(((x + 0.5) / width) * shape.width))
          const inside = shape.alpha[sy * shape.width + sx]! / 255
          sum += inside * baked[y * width + x]!
          weight += inside
        }
      }
      return weight > 0 ? sum / weight : 0
    },
  }
}
