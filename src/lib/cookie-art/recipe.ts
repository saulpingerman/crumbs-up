/**
 * Turns a cookie's type and review into a drawing recipe.
 *
 * The type decides what kind of cookie it is (dough, mix-ins, finish); the
 * review decides how good a specimen it is — how generous the mix-ins are,
 * how even the bake, how tidy the shape, and which flaws show.
 *
 * Pure data in, pure data out, so it can be tested without a canvas.
 */
import type { CookieRecord } from '@/lib/db/schema'
import { ANCHORS, getQuestion, TEXTURE_STYLE_QUESTION_ID } from '@/lib/rubric'

export type Finish = 'salt' | 'sugar' | 'sprinkles' | 'drizzle' | 'oats' | 'powder'

export interface MixIn {
  /** One color, or several to scatter at random (candy pieces). */
  colors: string[]
  count: number
  /** Radius on a 1200px canvas. */
  size: number
}

export type SurfaceName = 'marble' | 'parchment' | 'walnut' | 'slate' | 'linen' | 'blush'

export interface CookieArt {
  seed: number
  surface: SurfaceName
  /** Dough gradient, center to edge. */
  dough: [string, string]
  mixIns: MixIn[]
  finishes: Finish[]
  /** Number of surface cracks. */
  cracks: number
  /** 1 = a normal cookie; bigger spreads wider. */
  spread: number
  /** 1 = gently irregular; higher is more misshapen. */
  wobble: number
  /** 0–1: how strongly the edge is browned. */
  rim: number
  /** 0–1: glossy highlight (melted chocolate, or grease). */
  sheen: number
  /** A break running across the cookie. */
  broken: boolean
}

export type ArtSource = Pick<CookieRecord, 'id' | 'cookieType' | 'answers' | 'scores'>

const CHOCOLATE = '#3b2012'
const DARK = '#20100a'
const MILK = '#6b3d22'
const WHITE = '#fbf1dc'
const CANDY = ['#e23b4e', '#f2b705', '#2f9e5b', '#2f6fd0', '#f07c1f', '#7b4a2a']

interface Base {
  dough: [string, string]
  mixIns?: MixIn[]
  finishes?: Finish[]
  cracks?: number
}

const chips = (color: string, count: number, size: number): MixIn => ({
  colors: [color],
  count,
  size,
})

const GOLDEN: [string, string] = ['#deb373', '#b5803f']

/** First match wins, so the more specific cookies come first. */
const RECIPES: [RegExp, Base][] = [
  [/red velvet/, { dough: ['#a8322e', '#641613'], mixIns: [chips(WHITE, 12, 32)], cracks: 6 }],
  [
    /cookies?\s*(&|and|n|’n’|'n')\s*cream|oreo/,
    {
      dough: ['#efe3cb', '#cdb68c'],
      mixIns: [chips('#2a1a14', 16, 30), chips(WHITE, 6, 24)],
      cracks: 3,
    },
  ],
  [
    /matcha|pistachio|mint|pandan/,
    { dough: ['#bccb8c', '#8b9c55'], mixIns: [chips(WHITE, 8, 30)], cracks: 4 },
  ],
  [/lemon|citrus|lime|yuzu/, { dough: ['#f1dc8a', '#d9b548'], finishes: ['sugar'], cracks: 7 }],
  [
    /double choc|triple choc|chocolate chocolate|brownie|cocoa|fudge|crinkle|mocha|espresso/,
    { dough: ['#5a3320', '#2e170c'], mixIns: [chips(DARK, 14, 42)], cracks: 8 },
  ],
  [/oat/, { dough: ['#cf9c5c', '#96602b'], finishes: ['oats'], cracks: 2 }],
  [/peanut|\bpb\b/, { dough: ['#d9a35a', '#a66c2a'], finishes: ['sugar'], cracks: 9 }],
  [/snicker|cinnamon|churro/, { dough: ['#e2b577', '#b9813f'], finishes: ['sugar'], cracks: 9 }],
  [
    /molasses|ginger|spice|chai/,
    { dough: ['#a9622d', '#6d3814'], finishes: ['sugar'], cracks: 10 },
  ],
  [
    /birthday|funfetti|confetti|sprinkle|cake batter|unicorn/,
    {
      dough: ['#f3dfb6', '#dcb97a'],
      mixIns: [chips(WHITE, 8, 30)],
      finishes: ['sprinkles'],
      cracks: 1,
    },
  ],
  [/shortbread|sabl[eé]|butter cookie/, { dough: ['#f3e0b8', '#dcbc82'], cracks: 0 }],
  [/sugar/, { dough: ['#f0dbb0', '#d8b77c'], finishes: ['sugar'], cracks: 3 }],
  [
    /m\s*&\s*m|m and m|candy|monster|smartie/,
    { dough: GOLDEN, mixIns: [{ colors: CANDY, count: 16, size: 30 }], cracks: 4 },
  ],
  [
    /s[’']?mores?|marshmallow|rocky road/,
    { dough: GOLDEN, mixIns: [chips(CHOCOLATE, 8, 46), chips(WHITE, 8, 40)], cracks: 4 },
  ],
  [
    /white choc|macadamia/,
    {
      dough: ['#e6c084', '#bd8a48'],
      mixIns: [chips(WHITE, 11, 34), chips('#e9cf9d', 8, 30)],
      cracks: 5,
    },
  ],
  [
    /pumpkin|sweet potato|carrot/,
    { dough: ['#e0a050', '#b06a22'], finishes: ['sugar'], cracks: 6 },
  ],
  [
    /ube|taro|blueberr|lavender/,
    { dough: ['#b79bd0', '#7f5fa6'], mixIns: [chips(WHITE, 8, 30)], cracks: 4 },
  ],
  [
    /strawberr|raspberr|cherry|cranberr|berry|jam|thumbprint/,
    { dough: ['#f0d6ae', '#d6b078'], mixIns: [chips('#b3243f', 9, 34)], cracks: 3 },
  ],
  [
    /caramel|toffee|butterscotch|dulce|biscoff|speculoos/,
    {
      dough: ['#dba765', '#a8662c'],
      mixIns: [chips('#b9772e', 10, 34)],
      finishes: ['salt'],
      cracks: 6,
    },
  ],
  [
    /kitchen sink|compost|everything|loaded|trash/,
    {
      dough: GOLDEN,
      mixIns: [chips(CHOCOLATE, 9, 38), chips('#c9a15a', 7, 30), chips(WHITE, 5, 28)],
      cracks: 5,
    },
  ],
  [
    /black\s*(&|and)\s*white|half moon|iced|frosted|glazed/,
    { dough: ['#f0dbb0', '#d8b77c'], finishes: ['drizzle'], cracks: 0 },
  ],
  [
    /pecan|walnut|almond|hazelnut|\bnut/,
    { dough: GOLDEN, mixIns: [chips('#8a5a2b', 12, 30)], cracks: 5 },
  ],
  [/choc|chip|chunk/, { dough: GOLDEN, mixIns: [chips(CHOCOLATE, 13, 36)], cracks: 5 }],
]

const PLAIN: Base = { dough: GOLDEN, cracks: 6 }

/** Stable 32-bit hash, so a cookie always gets the same drawing. */
export function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16)
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255
}

function shade(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16)
  const mix = (c: number) =>
    Math.round(Math.min(255, Math.max(0, amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)))
  const r = mix((n >> 16) & 255)
  const g = mix((n >> 8) & 255)
  const b = mix(n & 255)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

/**
 * The rung (1–6) chosen for a scored question; `0` for "doesn't apply".
 * A cookie scored by hand has no answers, so its appearance score stands in.
 */
function rungOf(source: ArtSource, questionId: string): number {
  const answer = source.answers[questionId]
  if (typeof answer === 'string') {
    if (answer.endsWith('.na')) return 0
    const rung = Number(answer.slice(answer.lastIndexOf('.') + 1))
    if (rung >= 1 && rung <= 6) return rung
  }
  let nearest = 0
  ANCHORS.forEach((anchor, i) => {
    if (
      Math.abs(anchor - source.scores.appearance) <
      Math.abs(ANCHORS[nearest]! - source.scores.appearance)
    ) {
      nearest = i
    }
  })
  return nearest + 1
}

function flagged(source: ArtSource, questionId: string, flawId: string): boolean {
  const answer = source.answers[questionId]
  return Array.isArray(answer) && answer.includes(flawId)
}

function textureStyle(source: ArtSource): string | null {
  const question = getQuestion(TEXTURE_STYLE_QUESTION_ID)
  const answer = source.answers[TEXTURE_STYLE_QUESTION_ID]
  if (question?.kind !== 'context' || typeof answer !== 'string') return null
  return answer.slice(answer.lastIndexOf('.') + 1)
}

/** By rung 1–6. */
const MIX_IN_AMOUNT = [0.35, 0.65, 1, 1.3, 1.65, 2]
const WOBBLE = [2.4, 1.7, 1, 0.8, 0.62, 0.5]
const CRACKS = [0.3, 0.6, 1, 1.25, 1.5, 1.7]

export function artFor(source: ArtSource): CookieArt {
  const type = source.cookieType.toLowerCase()
  const base = RECIPES.find(([pattern]) => pattern.test(type))?.[1] ?? PLAIN
  const seed = hash(source.id)

  let dough = base.dough
  let mixIns = (base.mixIns ?? []).map((m) => ({ ...m }))
  const finishes = new Set<Finish>(base.finishes ?? [])
  let cracks = base.cracks ?? 4
  let spread = 1
  let rim = 0.34
  let sheen = 0.2

  // Words in the name that change the look whatever the base cookie is.
  if (/oat/.test(type)) {
    if (/raisin/.test(type)) mixIns.push(chips('#3a1d24', 16, 24))
    else if (/choc|chip/.test(type)) mixIns.push(chips(CHOCOLATE, 12, 30))
  }
  if (/peanut|\bpb\b|pumpkin|mint/.test(type) && /choc|chip/.test(type))
    mixIns.push(chips(MILK, 10, 32))
  if (/chunk/.test(type) && mixIns[0]) mixIns[0].size *= 1.25
  if (/brown butter|browned butter/.test(type)) {
    dough = [shade(dough[0], -0.06), shade(dough[1], -0.12)]
    finishes.add('salt')
  }
  if (/salt/.test(type)) finishes.add('salt')
  if (/crinkle|powdered|snowball|wedding/.test(type)) finishes.add('powder')
  if (/drizzle|glaze|iced|frosted/.test(type)) finishes.add('drizzle')

  // --- What the review says about this particular cookie -------------------

  const generosity = rungOf(source, 'look.mixins')
  const amount = generosity === 0 ? 0 : MIX_IN_AMOUNT[generosity - 1]!
  mixIns = mixIns
    .map((m) => ({ ...m, count: Math.round(m.count * amount) }))
    .filter((m) => m.count > 0)

  const shape = rungOf(source, 'look.shape') || 3
  let wobble = WOBBLE[shape - 1]!

  const surface = rungOf(source, 'look.surface') || 3
  cracks = Math.round(cracks * CRACKS[surface - 1]!)
  if (surface >= 5) sheen += 0.08

  const color = rungOf(source, 'look.color') || 3
  if (color >= 5) rim += 0.08
  if (color <= 2) rim += 0.14

  const burnt = flagged(source, 'look.flaws', 'look.flaw.burnt')
  const pale = flagged(source, 'look.flaws', 'look.flaw.pale')
  if (burnt) {
    dough = [shade(dough[0], -0.12), shade(dough[1], -0.42)]
    rim = 0.8
  } else if (pale) {
    dough = [shade(dough[0], 0.18), shade(dough[1], 0.24)]
    rim = 0.1
  }
  if (flagged(source, 'look.flaws', 'look.flaw.spread')) spread *= 1.1
  if (flagged(source, 'look.flaws', 'look.flaw.greasy')) sheen += 0.3
  if (flagged(source, 'look.flaws', 'look.flaw.dried')) {
    cracks += 6
    sheen = 0.05
  }
  if (flagged(source, 'look.flaws', 'look.flaw.sloppy')) wobble *= 1.25

  switch (textureStyle(source)) {
    case 'crisp':
      spread *= 1.07
      rim += 0.12
      break
    case 'cakey':
      spread *= 0.92
      cracks = Math.round(cracks * 0.6)
      wobble *= 0.85
      break
    case 'gooey':
      spread *= 0.97
      sheen += 0.12
      mixIns = mixIns.map((m) => ({ ...m, size: m.size * 1.15 }))
      break
    case 'sandy':
      cracks = Math.round(cracks * 0.5)
      sheen *= 0.5
      break
    case 'contrast':
      rim += 0.1
      break
  }

  // Put pale cookies on dark tables and dark cookies on light ones.
  const tone = luminance(dough[0])
  const tables: SurfaceName[] =
    tone > 0.78
      ? ['walnut', 'slate', 'blush']
      : tone < 0.4
        ? ['marble', 'linen', 'parchment']
        : ['marble', 'parchment', 'linen', 'walnut', 'slate']

  return {
    seed,
    surface: tables[seed % tables.length]!,
    dough,
    mixIns,
    finishes: [...finishes],
    cracks: Math.max(0, cracks),
    spread,
    wobble,
    rim: Math.min(0.9, rim),
    sheen: Math.min(0.6, sheen),
    broken: flagged(source, 'look.flaws', 'look.flaw.broken'),
  }
}
