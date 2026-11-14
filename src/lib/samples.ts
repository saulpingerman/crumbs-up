/**
 * Demo cookies for a first look around. Everything here is invented — the
 * bakeries are fictional and the "photos" are drawn on a canvas — and every
 * record is flagged `sample` so the whole batch can be removed in one tap.
 * This module is loaded on demand so it costs nothing until it is asked for.
 */
import { saveCookie, type SaveCookieInput } from '@/lib/db/cookies'
import { db } from '@/lib/db/db'
import { todayIso } from '@/lib/format'
import { processPhoto } from '@/lib/image'
import { QUESTIONS, assessAll, type Answers, type Category, type Scores } from '@/lib/rubric'

/* ------------------------------ Tiny RNG -------------------------------- */

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ------------------------------- Artwork -------------------------------- */

type Extra = 'salt' | 'sugar' | 'sprinkles' | 'drizzle' | 'oats' | 'cracks' | 'powder'

interface Art {
  /** Tabletop gradient, inner to outer. */
  surface: [string, string]
  /** Dough gradient, center to edge. */
  dough: [string, string]
  chips: { color: string; count: number; size: number }[]
  extras: Extra[]
  seed: number
}

const SIZE = 1200

function drawCookie(art: Art): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SIZE
  const ctx = canvas.getContext('2d')!
  const rand = mulberry32(art.seed)
  const between = (min: number, max: number) => min + rand() * (max - min)
  const cx = SIZE / 2 + between(-20, 20)
  const cy = SIZE / 2 + between(-10, 30)
  const radius = between(380, 420)

  // Tabletop
  const table = ctx.createRadialGradient(cx - 150, cy - 220, 100, cx, cy, SIZE * 0.85)
  table.addColorStop(0, art.surface[0])
  table.addColorStop(1, art.surface[1])
  ctx.fillStyle = table
  ctx.fillRect(0, 0, SIZE, SIZE)
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(${rand() > 0.5 ? '255,255,255' : '0,0,0'},${between(0.015, 0.05)})`
    ctx.fillRect(rand() * SIZE, rand() * SIZE, between(1, 4), between(1, 4))
  }

  // A slightly wobbly outline, like a real drop cookie.
  const wobble = Array.from({ length: 4 }, () => ({
    amp: between(4, 13),
    freq: Math.round(between(2, 7)),
    phase: between(0, Math.PI * 2),
  }))
  const edge = (angle: number, scale = 1) => {
    const r = radius + wobble.reduce((s, w) => s + w.amp * Math.sin(angle * w.freq + w.phase), 0)
    return [cx + Math.cos(angle) * r * scale, cy + Math.sin(angle) * r * scale] as const
  }
  const outline = (scale = 1) => {
    ctx.beginPath()
    for (let i = 0; i <= 180; i++) {
      const [x, y] = edge((i / 180) * Math.PI * 2, scale)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
  }

  // Drop shadow
  ctx.save()
  ctx.shadowColor = 'rgba(40,20,5,0.42)'
  ctx.shadowBlur = 70
  ctx.shadowOffsetX = 18
  ctx.shadowOffsetY = 34
  outline()
  ctx.fillStyle = art.dough[1]
  ctx.fill()
  ctx.restore()

  // Dough
  ctx.save()
  outline()
  ctx.clip()
  const dough = ctx.createRadialGradient(cx - 90, cy - 120, 40, cx, cy, radius * 1.05)
  dough.addColorStop(0, art.dough[0])
  dough.addColorStop(0.72, art.dough[0])
  dough.addColorStop(1, art.dough[1])
  ctx.fillStyle = dough
  ctx.fillRect(0, 0, SIZE, SIZE)

  // Crumb texture
  for (let i = 0; i < 2600; i++) {
    const angle = rand() * Math.PI * 2
    const dist = Math.sqrt(rand()) * radius
    ctx.fillStyle = `rgba(${rand() > 0.55 ? '255,240,210' : '70,35,10'},${between(0.03, 0.12)})`
    ctx.beginPath()
    ctx.arc(
      cx + Math.cos(angle) * dist,
      cy + Math.sin(angle) * dist,
      between(1.5, 9),
      0,
      Math.PI * 2,
    )
    ctx.fill()
  }

  if (art.extras.includes('cracks')) {
    ctx.lineCap = 'round'
    for (let i = 0; i < 9; i++) {
      const angle = rand() * Math.PI * 2
      const start = between(0.15, 0.6) * radius
      const x = cx + Math.cos(angle) * start
      const y = cy + Math.sin(angle) * start
      const bend = angle + between(-0.9, 0.9)
      const len = between(90, 230)
      for (const [dx, color, width] of [
        [0, 'rgba(60,28,8,0.34)', between(5, 11)],
        [4, 'rgba(255,236,200,0.28)', 3],
      ] as const) {
        ctx.strokeStyle = color
        ctx.lineWidth = width
        ctx.beginPath()
        ctx.moveTo(x + dx, y + dx)
        ctx.quadraticCurveTo(
          x + Math.cos(bend) * len * 0.5 + between(-30, 30) + dx,
          y + Math.sin(bend) * len * 0.5 + between(-30, 30) + dx,
          x + Math.cos(bend) * len + dx,
          y + Math.sin(bend) * len + dx,
        )
        ctx.stroke()
      }
    }
  }

  if (art.extras.includes('oats')) {
    for (let i = 0; i < 150; i++) {
      const angle = rand() * Math.PI * 2
      const dist = Math.sqrt(rand()) * radius * 0.95
      ctx.save()
      ctx.translate(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist)
      ctx.rotate(rand() * Math.PI)
      ctx.fillStyle = `rgba(245,224,180,${between(0.5, 0.85)})`
      ctx.strokeStyle = 'rgba(120,80,30,0.3)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.ellipse(0, 0, between(13, 22), between(7, 11), 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.restore()
    }
  }

  // Chips and chunks
  for (const chip of art.chips) {
    for (let i = 0; i < chip.count; i++) {
      const angle = rand() * Math.PI * 2
      const dist = Math.sqrt(rand()) * radius * 0.86
      const x = cx + Math.cos(angle) * dist
      const y = cy + Math.sin(angle) * dist
      const size = chip.size * between(0.7, 1.3)
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(rand() * Math.PI)
      ctx.shadowColor = 'rgba(40,15,0,0.35)'
      ctx.shadowBlur = 10
      ctx.shadowOffsetY = 4
      ctx.fillStyle = chip.color
      ctx.beginPath()
      const corners = 7
      for (let k = 0; k <= corners; k++) {
        const a = (k / corners) * Math.PI * 2
        const r = size * between(0.78, 1.08)
        const px = Math.cos(a) * r
        const py = Math.sin(a) * r * 0.86
        if (k === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
      ctx.fill()
      ctx.shadowColor = 'transparent'
      ctx.fillStyle = 'rgba(255,255,255,0.2)'
      ctx.beginPath()
      ctx.ellipse(-size * 0.25, -size * 0.3, size * 0.32, size * 0.16, -0.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }

  if (art.extras.includes('drizzle')) {
    ctx.strokeStyle = 'rgba(255,250,240,0.92)'
    ctx.lineWidth = 16
    ctx.lineCap = 'round'
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

  if (art.extras.includes('sprinkles')) {
    const colors = ['#ff5d8f', '#ffd23f', '#3bceac', '#4f8ef7', '#ffffff', '#b565e0']
    for (let i = 0; i < 120; i++) {
      const angle = rand() * Math.PI * 2
      const dist = Math.sqrt(rand()) * radius * 0.9
      ctx.save()
      ctx.translate(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist)
      ctx.rotate(rand() * Math.PI)
      ctx.fillStyle = colors[Math.floor(rand() * colors.length)]!
      ctx.beginPath()
      ctx.roundRect(-13, -4.5, 26, 9, 4.5)
      ctx.fill()
      ctx.restore()
    }
  }

  const scatter = (count: number, draw: (size: number) => void, spread = 0.92) => {
    for (let i = 0; i < count; i++) {
      const angle = rand() * Math.PI * 2
      const dist = Math.sqrt(rand()) * radius * spread
      ctx.save()
      ctx.translate(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist)
      ctx.rotate(rand() * Math.PI)
      draw(between(0.6, 1.4))
      ctx.restore()
    }
  }
  if (art.extras.includes('salt')) {
    scatter(
      70,
      (s) => {
        ctx.fillStyle = `rgba(255,255,255,${between(0.75, 0.98)})`
        ctx.fillRect(-5 * s, -5 * s, 10 * s, 10 * s)
      },
      0.8,
    )
  }
  if (art.extras.includes('sugar')) {
    scatter(900, (s) => {
      ctx.fillStyle = `rgba(255,255,255,${between(0.25, 0.75)})`
      ctx.fillRect(-2 * s, -2 * s, 4 * s, 4 * s)
    })
  }
  if (art.extras.includes('powder')) {
    scatter(2400, (s) => {
      ctx.fillStyle = `rgba(255,255,255,${between(0.2, 0.6)})`
      ctx.beginPath()
      ctx.arc(0, 0, 5 * s, 0, Math.PI * 2)
      ctx.fill()
    })
  }

  // Browned rim and a soft top-left highlight
  const rim = ctx.createRadialGradient(cx, cy, radius * 0.78, cx, cy, radius * 1.04)
  rim.addColorStop(0, 'rgba(90,40,5,0)')
  rim.addColorStop(1, 'rgba(90,40,5,0.34)')
  ctx.fillStyle = rim
  ctx.fillRect(0, 0, SIZE, SIZE)
  const shine = ctx.createRadialGradient(cx - 150, cy - 190, 10, cx - 150, cy - 190, radius * 0.9)
  shine.addColorStop(0, 'rgba(255,250,235,0.2)')
  shine.addColorStop(1, 'rgba(255,250,235,0)')
  ctx.fillStyle = shine
  ctx.fillRect(0, 0, SIZE, SIZE)
  ctx.restore()

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas export failed'))),
      'image/jpeg',
      0.9,
    ),
  )
}

/* ------------------------------- Cookies -------------------------------- */

const CHOCOLATE = '#3b2012'
const MILK = '#6b3d22'
const WHITE = '#fbf1dc'

const SURFACES = {
  marble: ['#f4f1ec', '#d6d0c7'],
  parchment: ['#f1e2c4', '#d3b98b'],
  walnut: ['#8a5a3a', '#4c2c19'],
  slate: ['#5c6468', '#2e3336'],
  linen: ['#e9e4dc', '#bdb5a8'],
  blush: ['#f6dcd6', '#dba99f'],
} satisfies Record<string, [string, string]>

interface Sample {
  cookieType: string
  bakery: string
  city: string
  state: string
  price: number
  daysAgo: number
  notes: string
  /** Rung (1–6) chosen for each scored question, in rubric order. */
  taste: number[]
  texture: number[]
  appearance: number[]
  style: 'gooey' | 'chewy' | 'contrast' | 'crisp' | 'cakey' | 'sandy'
  flaws?: string[]
  nudge?: Partial<Scores>
  art: Omit<Art, 'seed'>
}

const SAMPLES: Sample[] = [
  {
    cookieType: 'Brown Butter Chocolate Chip',
    bakery: 'Butter & Ember',
    city: 'Portland',
    state: 'OR',
    price: 4.75,
    daysAgo: 6,
    notes:
      'Still warm at 9am. Toffee edges, three kinds of chocolate, and flaky salt that makes the whole thing sing. The one to beat.',
    taste: [6, 5, 6, 5, 6],
    texture: [6, 5, 6, 5, 6],
    appearance: [5, 5, 5, 6, 6],
    style: 'contrast',
    art: {
      surface: SURFACES.marble,
      dough: ['#dba765', '#a8662c'],
      chips: [
        { color: CHOCOLATE, count: 13, size: 46 },
        { color: MILK, count: 6, size: 34 },
      ],
      extras: ['cracks', 'salt'],
    },
  },
  {
    cookieType: 'Snickerdoodle',
    bakery: 'Half Moon Bakehouse',
    city: 'Santa Fe',
    state: 'NM',
    price: 3.5,
    daysAgo: 19,
    notes: 'Tangy, proper cinnamon crust, soft all the way through. Looks plain, eats beautifully.',
    taste: [5, 5, 4, 5, 5],
    texture: [5, 5, 4, 5, 4],
    appearance: [4, 4, 4, 4, 7],
    style: 'chewy',
    art: {
      surface: SURFACES.walnut,
      dough: ['#e2b577', '#b9813f'],
      chips: [],
      extras: ['cracks', 'sugar'],
    },
  },
  {
    cookieType: 'Oatmeal Raisin',
    bakery: 'The Proofing Room',
    city: 'Madison',
    state: 'WI',
    price: 3.25,
    daysAgo: 33,
    notes: 'Plump raisins and plenty of oats, but baked a touch long — dry around the rim.',
    taste: [4, 4, 4, 4, 3],
    texture: [3, 2, 4, 3, 3],
    appearance: [4, 3, 4, 4, 4],
    style: 'chewy',
    flaws: ['bite.flaw.dry'],
    art: {
      surface: SURFACES.parchment,
      dough: ['#cf9c5c', '#96602b'],
      chips: [{ color: '#3a1d24', count: 16, size: 24 }],
      extras: ['oats'],
    },
  },
  {
    cookieType: 'Double Chocolate',
    bakery: 'Salt Flat Bakery',
    city: 'Salt Lake City',
    state: 'UT',
    price: 4.25,
    daysAgo: 47,
    notes:
      'Like the corner piece of a brownie. Deep cocoa, molten middle, almost too rich. Almost.',
    taste: [5, 4, 5, 6, 5],
    texture: [5, 5, 4, 5, 5],
    appearance: [5, 4, 4, 5, 5],
    style: 'gooey',
    art: {
      surface: SURFACES.linen,
      dough: ['#5a3320', '#2e170c'],
      chips: [{ color: '#20100a', count: 14, size: 42 }],
      extras: ['cracks', 'salt'],
    },
  },
  {
    cookieType: 'Birthday Cake',
    bakery: 'Sunday Sugar',
    city: 'Austin',
    state: 'TX',
    price: 5,
    daysAgo: 58,
    notes: 'Gorgeous in the case. Tastes mostly of sugar and imitation vanilla — all show.',
    taste: [2, 2, 2, 3, 2],
    texture: [3, 4, 3, 3, 4],
    appearance: [6, 4, 5, 5, 6],
    style: 'cakey',
    flaws: ['taste.flaw.artificial'],
    art: {
      surface: SURFACES.blush,
      dough: ['#f3dfb6', '#dcb97a'],
      chips: [{ color: WHITE, count: 8, size: 30 }],
      extras: ['sprinkles'],
    },
  },
  {
    cookieType: 'Molasses Ginger',
    bakery: 'Little Owl Baking Co.',
    city: 'Burlington',
    state: 'VT',
    price: 3.75,
    daysAgo: 74,
    notes:
      'Real bite from fresh ginger, sparkling sugar crust, chew for days. A cold-weather classic done right.',
    taste: [5, 5, 5, 6, 5],
    texture: [6, 5, 4, 5, 5],
    appearance: [5, 5, 5, 6, 7],
    style: 'chewy',
    art: {
      surface: SURFACES.slate,
      dough: ['#a9622d', '#6d3814'],
      chips: [],
      extras: ['cracks', 'sugar'],
    },
  },
  {
    cookieType: 'Chocolate Chip',
    bakery: 'Corner Mart Bakery Case',
    city: 'Columbus',
    state: 'OH',
    price: 2,
    daysAgo: 90,
    notes: 'The baseline. This is what a 5 tastes like: perfectly fine, instantly forgotten.',
    taste: [3, 3, 3, 3, 3],
    texture: [3, 3, 3, 3, 3],
    appearance: [3, 3, 3, 3, 3],
    style: 'chewy',
    art: {
      surface: SURFACES.parchment,
      dough: ['#deb373', '#b5803f'],
      chips: [{ color: CHOCOLATE, count: 12, size: 26 }],
      extras: [],
    },
  },
  {
    cookieType: 'White Chocolate Macadamia',
    bakery: 'Driftwood Ovens',
    city: 'Charleston',
    state: 'SC',
    price: 4.5,
    daysAgo: 104,
    notes: 'Toasted, buttery macadamias. Sweet, but the browned edges keep it honest.',
    taste: [4, 4, 5, 5, 4],
    texture: [5, 4, 5, 4, 4],
    appearance: [4, 5, 4, 4, 5],
    style: 'contrast',
    art: {
      surface: SURFACES.marble,
      dough: ['#e6c084', '#bd8a48'],
      chips: [
        { color: WHITE, count: 11, size: 34 },
        { color: '#e9cf9d', count: 8, size: 30 },
      ],
      extras: ['cracks'],
    },
  },
  {
    cookieType: 'Peanut Butter',
    bakery: 'Butter & Ember',
    city: 'Portland',
    state: 'OR',
    price: 4,
    daysAgo: 121,
    notes:
      'Sandy and rich, roasted-peanut flavor front and center. A little greasy by the last bite.',
    taste: [4, 4, 5, 6, 4],
    texture: [5, 4, 3, 3, 4],
    appearance: [4, 4, 4, 4, 7],
    style: 'sandy',
    flaws: ['bite.flaw.greasy'],
    nudge: { taste: 0.5 },
    art: {
      surface: SURFACES.walnut,
      dough: ['#d9a35a', '#a66c2a'],
      chips: [],
      extras: ['cracks', 'sugar'],
    },
  },
  {
    cookieType: 'Lemon Crinkle',
    bakery: 'Tin Roof Sweets',
    city: 'Asheville',
    state: 'NC',
    price: 3.5,
    daysAgo: 139,
    notes: 'Bright and zesty with a soft, cake-like middle. Pretty, but a bit one-note.',
    taste: [3, 4, 4, 5, 3],
    texture: [4, 4, 3, 4, 4],
    appearance: [5, 4, 4, 5, 7],
    style: 'cakey',
    art: {
      surface: SURFACES.linen,
      dough: ['#f1dc8a', '#d9b548'],
      chips: [],
      extras: ['cracks', 'powder'],
    },
  },
]

function answersFor(sample: Sample): Answers {
  const answers: Answers = { 'bite.style': `bite.style.${sample.style}` }
  const fill = (category: Category, rungs: number[]) => {
    const scored = QUESTIONS[category].filter((q) => q.kind === 'scale')
    scored.forEach((q, i) => {
      const rung = rungs[i] ?? 3
      // Rung 7 stands for the question's "doesn't apply" option.
      answers[q.id] = rung === 7 ? `${q.id}.na` : `${q.id}.${rung}`
    })
    const flawQuestion = QUESTIONS[category].find((q) => q.kind === 'flaws')
    if (flawQuestion) {
      answers[flawQuestion.id] = (sample.flaws ?? []).filter((f) =>
        f.startsWith(flawQuestion.id.split('.')[0]!),
      )
    }
  }
  fill('taste', sample.taste)
  fill('texture', sample.texture)
  fill('appearance', sample.appearance)
  return answers
}

function isoDaysAgo(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return todayIso(date)
}

export async function addSampleCookies(): Promise<number> {
  // Draw everything first, then save in one transaction, so the journal
  // fills in all at once and an interruption can't leave half a batch behind.
  const batch: SaveCookieInput[] = []
  for (const [i, sample] of SAMPLES.entries()) {
    const answers = answersFor(sample)
    const assessed = assessAll(answers)
    const suggested: Scores = {
      taste: assessed.taste.score,
      texture: assessed.texture.score,
      appearance: assessed.appearance.score,
    }
    const scores: Scores = {
      taste: suggested.taste + (sample.nudge?.taste ?? 0),
      texture: suggested.texture + (sample.nudge?.texture ?? 0),
      appearance: suggested.appearance + (sample.nudge?.appearance ?? 0),
    }
    const blob = await drawCookie({ ...sample.art, seed: 1000 + i * 77 })
    batch.push({
      details: {
        eatenOn: isoDaysAgo(sample.daysAgo),
        cookieType: sample.cookieType,
        bakery: sample.bakery,
        city: sample.city,
        state: sample.state,
        price: sample.price,
      },
      notes: sample.notes,
      answers,
      suggested,
      scores,
      photo: await processPhoto(blob),
      sample: true,
      createdAt: Date.now() - sample.daysAgo * 86_400_000,
    })
  }
  await db.transaction('rw', db.cookies, db.photos, db.thumbs, async () => {
    for (const input of batch) await saveCookie(input)
  })
  return batch.length
}
