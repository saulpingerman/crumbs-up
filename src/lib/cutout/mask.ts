/**
 * Cleans up a raw segmentation mask into a usable cut-out shape.
 *
 * The model returns a confidence (0–1) per pixel. From that we keep the one
 * blob the tap landed on, fill any holes in it (dark chocolate chips often
 * read as "not cookie"), and sanity-check that what's left could plausibly
 * be a cookie rather than the whole table. Pure functions — no canvas.
 */

export interface Point {
  /** 0–1 across the image. */
  x: number
  /** 0–1 down the image. */
  y: number
}

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export interface RefinedMask {
  width: number
  height: number
  /** Opacity per pixel, 0–255. */
  alpha: Uint8ClampedArray
  /** Tight bounds of the shape, in mask pixels. */
  box: Box
  /** Share of the image the shape covers, 0–1. */
  coverage: number
}

const THRESHOLD = 0.5
/** Smaller than this and it is a crumb, not a cookie. */
const MIN_COVERAGE = 0.012
/** Bigger than this and the model has picked the table. */
const MAX_COVERAGE = 0.88
/** Holes up to this share of the shape's own area are filled in. */
const MAX_HOLE = 0.04
/** How far (as a share of the long edge) to look for the shape around a tap. */
const SEARCH_RADIUS = 0.08

function nearestOn(on: Uint8Array, width: number, height: number, px: number, py: number): number {
  if (on[py * width + px]) return py * width + px
  const reach = Math.round(Math.max(width, height) * SEARCH_RADIUS)
  for (let r = 1; r <= reach; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const x = px + dx
        const y = py + dy
        if (x >= 0 && y >= 0 && x < width && y < height && on[y * width + x]) return y * width + x
      }
    }
  }
  return -1
}

/** Flood-fill from `start` over pixels where `passable` is set; returns the visited map. */
function flood(passable: Uint8Array, width: number, height: number, starts: number[]): Uint8Array {
  const seen = new Uint8Array(width * height)
  const queue = new Int32Array(width * height)
  let head = 0
  let tail = 0
  for (const s of starts) {
    if (passable[s] && !seen[s]) {
      seen[s] = 1
      queue[tail++] = s
    }
  }
  while (head < tail) {
    const i = queue[head++]!
    const x = i % width
    const up = i - width
    const down = i + width
    if (x > 0 && passable[i - 1] && !seen[i - 1]) {
      seen[i - 1] = 1
      queue[tail++] = i - 1
    }
    if (x < width - 1 && passable[i + 1] && !seen[i + 1]) {
      seen[i + 1] = 1
      queue[tail++] = i + 1
    }
    if (up >= 0 && passable[up] && !seen[up]) {
      seen[up] = 1
      queue[tail++] = up
    }
    if (down < passable.length && passable[down] && !seen[down]) {
      seen[down] = 1
      queue[tail++] = down
    }
  }
  return seen
}

/**
 * @returns the cleaned shape, or `null` when nothing cookie-like was found
 * at that point.
 */
export function refineMask(
  confidence: Float32Array,
  width: number,
  height: number,
  point: Point,
): RefinedMask | null {
  const total = width * height
  if (confidence.length !== total || total === 0) return null

  const on = new Uint8Array(total)
  for (let i = 0; i < total; i++) on[i] = confidence[i]! > THRESHOLD ? 1 : 0

  const px = Math.min(width - 1, Math.max(0, Math.round(point.x * (width - 1))))
  const py = Math.min(height - 1, Math.max(0, Math.round(point.y * (height - 1))))
  const seed = nearestOn(on, width, height, px, py)
  if (seed < 0) return null

  // Keep only the blob under the tap.
  const blob = flood(on, width, height, [seed])

  // Fill small holes — dark chocolate chips often read as "not cookie". Big
  // enclosed gaps (the plate showing between two cookies) are left alone.
  const off = new Uint8Array(total)
  let blobSize = 0
  for (let i = 0; i < total; i++) {
    off[i] = blob[i] ? 0 : 1
    blobSize += blob[i]!
  }
  const border: number[] = []
  for (let x = 0; x < width; x++) border.push(x, (height - 1) * width + x)
  for (let y = 0; y < height; y++) border.push(y * width, y * width + width - 1)
  const outside = flood(off, width, height, border)
  const maxHole = blobSize * MAX_HOLE
  const members = new Int32Array(total)
  for (let i = 0; i < total; i++) {
    if (!off[i] || outside[i]) continue
    // An enclosed gap we haven't measured yet: walk it, clearing as we go.
    let head = 0
    let tail = 0
    off[i] = 0
    members[tail++] = i
    while (head < tail) {
      const j = members[head++]!
      const x = j % width
      for (const n of [x > 0 ? j - 1 : -1, x < width - 1 ? j + 1 : -1, j - width, j + width]) {
        if (n >= 0 && n < total && off[n] && !outside[n]) {
          off[n] = 0
          members[tail++] = n
        }
      }
    }
    // Big gaps join the outside.
    if (tail > maxHole) for (let k = 0; k < tail; k++) outside[members[k]!] = 1
  }

  const alpha = new Uint8ClampedArray(total)
  let count = 0
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let i = 0; i < total; i++) {
    if (outside[i]) continue
    count++
    // Soft edge from the model's own confidence; filled holes are solid.
    const c = blob[i] ? confidence[i]! : 1
    const t = Math.min(1, Math.max(0, (c - 0.5) / 0.35))
    alpha[i] = Math.round(255 * t * t * (3 - 2 * t))
    const x = i % width
    const y = (i - x) / width
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }

  const coverage = count / total
  if (coverage < MIN_COVERAGE || coverage > MAX_COVERAGE) return null

  const box = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
  // A shape spanning the whole frame in both directions is the background.
  if (box.width >= width * 0.98 && box.height >= height * 0.98) return null

  return { width, height, alpha, box, coverage }
}
