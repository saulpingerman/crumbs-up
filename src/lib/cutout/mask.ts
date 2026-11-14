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
  /**
   * How much of the shape's convex outline it fills, 0–1. A cookie is close
   * to 1; a floor showing around furniture, or a person, is well below.
   */
  solidity: number
  /**
   * How much of the shape's outline runs along the edge of the photo, 0–1.
   * A cookie sits inside the frame; floors and tabletops run out of it.
   */
  onEdge: number
  /**
   * The biggest gap left inside the shape, if any: its size as a share of
   * the shape, and its middle. A wrapper or plate with a cookie-sized gap in
   * it means the cookie is in the gap.
   */
  gap: { share: number; center: Point } | null
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
  let gapsTotal = 0
  let biggestGap = 0
  let gapX = 0
  let gapY = 0
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
    if (tail <= maxHole) continue
    // Big gaps join the outside; remember the biggest.
    let sumX = 0
    let sumY = 0
    for (let k = 0; k < tail; k++) {
      const j = members[k]!
      outside[j] = 1
      sumX += j % width
      sumY += (j - (j % width)) / width
    }
    gapsTotal += tail
    if (tail > biggestGap) {
      biggestGap = tail
      gapX = sumX / tail
      gapY = sumY / tail
    }
  }

  const alpha = new Uint8ClampedArray(total)
  let count = 0
  /** Pixels of the shape with the outside (or the frame) next to them… */
  let outline = 0
  /** …and how many of those are up against the frame. */
  let framed = 0
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  // The left and right ends of the shape on each row, for its outline.
  const rowMin = new Int32Array(height).fill(width)
  const rowMax = new Int32Array(height).fill(-1)
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
    if (x < rowMin[y]!) rowMin[y] = x
    if (x > rowMax[y]!) rowMax[y] = x
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
      outline++
      framed++
    } else if (outside[i - 1] || outside[i + 1] || outside[i - width] || outside[i + width]) {
      outline++
    }
  }

  const coverage = count / total
  if (coverage < MIN_COVERAGE || coverage > MAX_COVERAGE) return null

  const box = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
  // A shape spanning the whole frame in both directions is the background.
  if (box.width >= width * 0.98 && box.height >= height * 0.98) return null

  // Measured with the gaps counted in: this is about the outline.
  const outlined = count + gapsTotal
  const solidity = Math.min(1, outlined / Math.max(1, hullArea(rowMin, rowMax)))
  const gap =
    biggestGap > 0
      ? {
          share: biggestGap / outlined,
          center: { x: gapX / Math.max(1, width - 1), y: gapY / Math.max(1, height - 1) },
        }
      : null

  const onEdge = framed / Math.max(1, outline)

  return { width, height, alpha, box, coverage, solidity, onEdge, gap }
}

/**
 * Area of the convex hull of a shape given the first and last filled pixel
 * of each row. Pixels are treated as unit squares, so a filled rectangle
 * comes out as exactly its own area.
 */
function hullArea(rowMin: Int32Array, rowMax: Int32Array): number {
  // Corner points, already sorted top to bottom; the hull is built per side.
  const left: [number, number][] = []
  const right: [number, number][] = []
  for (let y = 0; y < rowMin.length; y++) {
    if (rowMax[y]! < 0) continue
    left.push([rowMin[y]!, y], [rowMin[y]!, y + 1])
    right.push([rowMax[y]! + 1, y], [rowMax[y]! + 1, y + 1])
  }
  if (left.length === 0) return 0
  // Walking down the rows, the left side may only ever turn one way and the
  // right side the other; drop any corner that would dent the outline.
  const chain = (points: [number, number][], sign: 1 | -1) => {
    const kept: [number, number][] = []
    for (const p of points) {
      while (kept.length >= 2) {
        const a = kept[kept.length - 2]!
        const b = kept[kept.length - 1]!
        const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
        if (cross * sign >= 0) kept.pop()
        else break
      }
      kept.push(p)
    }
    return kept
  }
  const outline = [...chain(left, 1), ...chain(right, -1).reverse()]
  let twice = 0
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!
    const b = outline[(i + 1) % outline.length]!
    twice += a[0] * b[1] - b[0] * a[1]
  }
  return Math.abs(twice) / 2
}

/** The middle of a hand-drawn loop: where its area balances. */
export function middleOf(outline: Point[]): Point {
  let twice = 0
  let x = 0
  let y = 0
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!
    const b = outline[(i + 1) % outline.length]!
    const cross = a.x * b.y - b.x * a.y
    twice += cross
    x += (a.x + b.x) * cross
    y += (a.y + b.y) * cross
  }
  if (Math.abs(twice) < 1e-9) {
    // A line, or a scribble that cancels itself out: fall back to the average.
    const n = Math.max(1, outline.length)
    return {
      x: outline.reduce((sum, point) => sum + point.x, 0) / n,
      y: outline.reduce((sum, point) => sum + point.y, 0) / n,
    }
  }
  return { x: x / (3 * twice), y: y / (3 * twice) }
}

/**
 * Trim a shape to a loop someone drew around the cookie. The loop is taken
 * generously — nobody draws a tight circle with a thumb — so it only cuts
 * away what is clearly outside it, like the wrapper the cookie sits on.
 *
 * @param slack How much to grow the loop about its middle before trimming.
 * @returns the trimmed shape, or null if the loop misses it altogether.
 */
export function keepWithin(mask: RefinedMask, outline: Point[], slack = 0.12): RefinedMask | null {
  if (outline.length < 3) return mask
  const { width, height } = mask
  const middle = middleOf(outline)
  const loop = outline.map((point) => ({
    x: (middle.x + (point.x - middle.x) * (1 + slack)) * (width - 1),
    y: (middle.y + (point.y - middle.y) * (1 + slack)) * (height - 1),
  }))

  const alpha = new Uint8ClampedArray(mask.alpha.length)
  let count = 0
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  const crossings: number[] = []
  for (let y = 0; y < height; y++) {
    // Where this row crosses the loop; between each pair of crossings is inside.
    crossings.length = 0
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i]!
      const b = loop[(i + 1) % loop.length]!
      if (a.y <= y !== b.y <= y) crossings.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x))
    }
    crossings.sort((p, q) => p - q)
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      const from = Math.max(0, Math.ceil(crossings[k]!))
      const to = Math.min(width - 1, Math.floor(crossings[k + 1]!))
      for (let x = from; x <= to; x++) {
        const value = mask.alpha[y * width + x]!
        if (value === 0) continue
        alpha[y * width + x] = value
        count++
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  const coverage = count / (width * height)
  if (coverage < MIN_COVERAGE) return null
  return {
    ...mask,
    alpha,
    coverage,
    box: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
  }
}
