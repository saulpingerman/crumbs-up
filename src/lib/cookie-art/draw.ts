/**
 * Draws a top-down cookie on a tabletop from a recipe. Used for cookies
 * that have no photo, and for the backdrop behind cut-out photos.
 */
import type { CookieArt, SurfaceName } from './recipe'

export const SURFACES: Record<SurfaceName, [string, string]> = {
  marble: ['#f4f1ec', '#d6d0c7'],
  parchment: ['#f1e2c4', '#d3b98b'],
  walnut: ['#8a5a3a', '#4c2c19'],
  slate: ['#5c6468', '#2e3336'],
  linen: ['#e9e4dc', '#bdb5a8'],
  blush: ['#f6dcd6', '#dba99f'],
}

export function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Ctx = CanvasRenderingContext2D

/** A softly lit tabletop with a little grain. */
export function paintSurface(
  ctx: Ctx,
  size: number,
  surface: SurfaceName,
  rand: () => number,
): void {
  const [inner, outer] = SURFACES[surface]
  const light = ctx.createRadialGradient(
    size * 0.38,
    size * 0.3,
    size * 0.08,
    size / 2,
    size / 2,
    size * 0.85,
  )
  light.addColorStop(0, inner)
  light.addColorStop(1, outer)
  ctx.fillStyle = light
  ctx.fillRect(0, 0, size, size)
  const k = size / 1200
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(${rand() > 0.5 ? '255,255,255' : '0,0,0'},${0.015 + rand() * 0.035})`
    ctx.fillRect(rand() * size, rand() * size, (1 + rand() * 3) * k, (1 + rand() * 3) * k)
  }
}

export function drawCookie(canvas: HTMLCanvasElement, art: CookieArt): void {
  const size = canvas.width
  const ctx = canvas.getContext('2d')!
  const rand = mulberry32(art.seed)
  const between = (min: number, max: number) => min + rand() * (max - min)
  // Everything below is authored for a 1200px canvas and scaled by `k`.
  const k = size / 1200
  const cx = size / 2 + between(-16, 16) * k
  const cy = size / 2 + between(-8, 22) * k
  const radius = between(385, 410) * k * art.spread

  paintSurface(ctx, size, art.surface, rand)

  // A slightly wobbly outline, like a real drop cookie.
  const waves = Array.from({ length: 4 }, () => ({
    amp: between(4, 12) * k * art.wobble,
    freq: Math.round(between(2, 7)),
    phase: between(0, Math.PI * 2),
  }))
  const edge = (angle: number) => {
    const r = radius + waves.reduce((sum, w) => sum + w.amp * Math.sin(angle * w.freq + w.phase), 0)
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r] as const
  }
  const outline = () => {
    ctx.beginPath()
    for (let i = 0; i <= 180; i++) {
      const [x, y] = edge((i / 180) * Math.PI * 2)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
  }
  const scatter = (count: number, spreadTo: number, draw: (scale: number) => void) => {
    for (let i = 0; i < count; i++) {
      const angle = rand() * Math.PI * 2
      const dist = Math.sqrt(rand()) * radius * spreadTo
      ctx.save()
      ctx.translate(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist)
      ctx.rotate(rand() * Math.PI)
      draw(between(0.6, 1.4) * k)
      ctx.restore()
    }
  }

  // Drop shadow
  ctx.save()
  ctx.shadowColor = 'rgba(40,20,5,0.42)'
  ctx.shadowBlur = 70 * k
  ctx.shadowOffsetX = 18 * k
  ctx.shadowOffsetY = 34 * k
  outline()
  ctx.fillStyle = art.dough[1]
  ctx.fill()
  ctx.restore()

  ctx.save()
  outline()
  ctx.clip()

  // Dough
  const dough = ctx.createRadialGradient(cx - 90 * k, cy - 120 * k, 40 * k, cx, cy, radius * 1.05)
  dough.addColorStop(0, art.dough[0])
  dough.addColorStop(0.72, art.dough[0])
  dough.addColorStop(1, art.dough[1])
  ctx.fillStyle = dough
  ctx.fillRect(0, 0, size, size)

  // Crumb texture
  scatter(2600, 1, (s) => {
    ctx.fillStyle = `rgba(${rand() > 0.55 ? '255,240,210' : '70,35,10'},${between(0.03, 0.12)})`
    ctx.beginPath()
    ctx.arc(0, 0, between(2, 7) * s, 0, Math.PI * 2)
    ctx.fill()
  })

  // Cracks
  ctx.lineCap = 'round'
  for (let i = 0; i < art.cracks; i++) {
    const angle = rand() * Math.PI * 2
    const start = between(0.15, 0.6) * radius
    const x = cx + Math.cos(angle) * start
    const y = cy + Math.sin(angle) * start
    const bend = angle + between(-0.9, 0.9)
    const length = between(90, 230) * k
    const mx = x + Math.cos(bend) * length * 0.5 + between(-30, 30) * k
    const my = y + Math.sin(bend) * length * 0.5 + between(-30, 30) * k
    const strokes = [
      [0, 'rgba(60,28,8,0.34)', between(5, 11) * k],
      [4 * k, 'rgba(255,236,200,0.28)', 3 * k],
    ] as const
    for (const [offset, color, width] of strokes) {
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.beginPath()
      ctx.moveTo(x + offset, y + offset)
      ctx.quadraticCurveTo(
        mx + offset,
        my + offset,
        x + Math.cos(bend) * length + offset,
        y + Math.sin(bend) * length + offset,
      )
      ctx.stroke()
    }
  }

  if (art.finishes.includes('oats')) {
    scatter(150, 0.95, (s) => {
      ctx.fillStyle = `rgba(245,224,180,${between(0.5, 0.85)})`
      ctx.strokeStyle = 'rgba(120,80,30,0.3)'
      ctx.lineWidth = 2 * k
      ctx.beginPath()
      ctx.ellipse(0, 0, 17 * s, 9 * s, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    })
  }

  // Chips, chunks, nuts and candy
  for (const mixIn of art.mixIns) {
    scatter(mixIn.count, 0.86, (s) => {
      const r = mixIn.size * s
      ctx.shadowColor = 'rgba(40,15,0,0.35)'
      ctx.shadowBlur = 10 * k
      ctx.shadowOffsetY = 4 * k
      ctx.fillStyle = mixIn.colors[Math.floor(rand() * mixIn.colors.length)]!
      ctx.beginPath()
      const corners = 7
      for (let c = 0; c <= corners; c++) {
        const a = (c / corners) * Math.PI * 2
        const pr = r * between(0.78, 1.08)
        if (c === 0) ctx.moveTo(Math.cos(a) * pr, Math.sin(a) * pr * 0.86)
        else ctx.lineTo(Math.cos(a) * pr, Math.sin(a) * pr * 0.86)
      }
      ctx.closePath()
      ctx.fill()
      ctx.shadowColor = 'transparent'
      ctx.fillStyle = `rgba(255,255,255,${0.14 + art.sheen * 0.4})`
      ctx.beginPath()
      ctx.ellipse(-r * 0.25, -r * 0.3, r * 0.32, r * 0.16, -0.5, 0, Math.PI * 2)
      ctx.fill()
    })
  }

  if (art.finishes.includes('drizzle')) {
    ctx.strokeStyle = 'rgba(255,250,240,0.92)'
    ctx.lineWidth = 16 * k
    ctx.lineJoin = 'round'
    ctx.beginPath()
    const rows = 9
    for (let i = 0; i <= rows; i++) {
      const y = cy - radius * 0.8 + (i / rows) * radius * 1.6
      const x = cx + (i % 2 ? 1 : -1) * radius * between(0.7, 0.95)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  if (art.finishes.includes('sprinkles')) {
    const colors = ['#ff5d8f', '#ffd23f', '#3bceac', '#4f8ef7', '#ffffff', '#b565e0']
    scatter(120, 0.9, (s) => {
      ctx.fillStyle = colors[Math.floor(rand() * colors.length)]!
      ctx.beginPath()
      ctx.roundRect(-13 * s, -4.5 * s, 26 * s, 9 * s, 4.5 * s)
      ctx.fill()
    })
  }
  if (art.finishes.includes('salt')) {
    scatter(70, 0.8, (s) => {
      ctx.fillStyle = `rgba(255,255,255,${between(0.75, 0.98)})`
      ctx.fillRect(-5 * s, -5 * s, 10 * s, 10 * s)
    })
  }
  if (art.finishes.includes('sugar')) {
    scatter(900, 0.92, (s) => {
      ctx.fillStyle = `rgba(255,255,255,${between(0.25, 0.75)})`
      ctx.fillRect(-2 * s, -2 * s, 4 * s, 4 * s)
    })
  }
  if (art.finishes.includes('powder')) {
    scatter(2400, 0.92, (s) => {
      ctx.fillStyle = `rgba(255,255,255,${between(0.2, 0.6)})`
      ctx.beginPath()
      ctx.arc(0, 0, 5 * s, 0, Math.PI * 2)
      ctx.fill()
    })
  }

  if (art.broken) {
    // A jagged break from edge to edge, slightly off-center.
    const angle = between(0, Math.PI)
    const offset = between(-0.25, 0.25) * radius
    const nx = Math.cos(angle + Math.PI / 2) * offset
    const ny = Math.sin(angle + Math.PI / 2) * offset
    ctx.beginPath()
    for (let i = 0; i <= 14; i++) {
      const t = (i / 14) * 2 - 1
      const jitter = between(-14, 14) * k
      const x =
        cx + nx + Math.cos(angle) * radius * 1.1 * t + Math.cos(angle + Math.PI / 2) * jitter
      const y =
        cy + ny + Math.sin(angle) * radius * 1.1 * t + Math.sin(angle + Math.PI / 2) * jitter
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.lineJoin = 'round'
    ctx.strokeStyle = 'rgba(30,14,4,0.55)'
    ctx.lineWidth = 15 * k
    ctx.stroke()
    ctx.strokeStyle = SURFACES[art.surface][1]
    ctx.lineWidth = 7 * k
    ctx.stroke()
  }

  // Browned rim and a soft top-left highlight
  const rim = ctx.createRadialGradient(cx, cy, radius * 0.76, cx, cy, radius * 1.04)
  rim.addColorStop(0, 'rgba(70,30,4,0)')
  rim.addColorStop(1, `rgba(70,30,4,${art.rim})`)
  ctx.fillStyle = rim
  ctx.fillRect(0, 0, size, size)
  const shine = ctx.createRadialGradient(
    cx - 150 * k,
    cy - 190 * k,
    10 * k,
    cx - 150 * k,
    cy - 190 * k,
    radius * 0.9,
  )
  shine.addColorStop(0, `rgba(255,250,235,${art.sheen})`)
  shine.addColorStop(1, 'rgba(255,250,235,0)')
  ctx.fillStyle = shine
  ctx.fillRect(0, 0, size, size)
  ctx.restore()
}
