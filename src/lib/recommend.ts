/**
 * Recommendations from your own ratings — no account, no other people's
 * data. The idea is the one a good friend uses: notice what the cookies you
 * loved have in common, and point at things with more of it.
 */
import {
  COOKIE_KINDS,
  STYLE_TRAITS,
  TEXTURE_TRAITS,
  TRAIT_LABEL,
  kindOf,
  type CookieKind,
  type Trait,
} from '@/lib/cookie-kinds'
import { TEXTURE_STYLE_QUESTION_ID } from '@/lib/rubric'
import { bakeryKey, byScoreDesc, mean, type RatedCookie } from '@/lib/stats'

/** Below this many recognizable cookies there isn't a palate to read yet. */
export const MIN_FOR_PALATE = 3

export interface Taste {
  trait: Trait
  label: string
  /** Positive = cookies with this trait score above your average. */
  lean: number
  /** Your best cookie that has it. */
  example: RatedCookie
}

export interface KindPick {
  kind: CookieKind
  /** The tastes of yours this kind plays to (empty before there is a palate). */
  because: Taste[]
}

export interface SecondChance {
  kind: CookieKind
  /** The disappointing one. */
  cookie: RatedCookie
  because: Taste[]
}

export interface ReturnTrip {
  bakery: string
  city: string
  state: string
  average: number
  count: number
  best: RatedCookie
}

export interface Recommendations {
  /** True once there are enough ratings to read a palate from. */
  personal: boolean
  likes: Taste[]
  dislikes: Taste[]
  tryNext: KindPick[]
  secondChances: SecondChance[]
  returnTrips: ReturnTrip[]
}

/** The traits one rated cookie stands for. */
function traitsOf(cookie: RatedCookie, kind: CookieKind): Trait[] {
  const answer = cookie.answers[TEXTURE_STYLE_QUESTION_ID]
  const style =
    typeof answer === 'string' ? STYLE_TRAITS[answer.slice(answer.lastIndexOf('.') + 1)] : undefined
  // What the cookie actually ate like beats what its kind usually eats like.
  if (!style) return kind.traits
  return [...kind.traits.filter((t) => !TEXTURE_TRAITS.includes(t)), ...style]
}

export function recommend(cookies: RatedCookie[]): Recommendations {
  const known = cookies
    .map((cookie) => ({ cookie, kind: kindOf(cookie.cookieType) }))
    .filter((entry): entry is { cookie: RatedCookie; kind: CookieKind } => Boolean(entry.kind))
  const average = mean(cookies.map((c) => c.overallExact))
  const personal = known.length >= MIN_FOR_PALATE

  // How far above or below your average do cookies with each trait land?
  type Totals = Map<Trait, { sum: number; n: number; best: RatedCookie }>
  const tally = (entries: typeof known): Totals => {
    const result: Totals = new Map()
    for (const { cookie, kind } of entries) {
      for (const trait of traitsOf(cookie, kind)) {
        const entry = result.get(trait)
        if (!entry) result.set(trait, { sum: cookie.overallExact - average, n: 1, best: cookie })
        else {
          entry.sum += cookie.overallExact - average
          entry.n += 1
          if (byScoreDesc(cookie, entry.best) < 0) entry.best = cookie
        }
      }
    }
    return result
  }
  const totals = tally(known)
  // One great cookie shouldn't define a palate, so small samples are pulled toward zero.
  const leanIn = (from: Totals, trait: Trait) => {
    const entry = from.get(trait)
    return entry ? entry.sum / (entry.n + 1.5) : 0
  }
  const lean = (trait: Trait) => leanIn(totals, trait)
  const taste = (trait: Trait): Taste => ({
    trait,
    label: TRAIT_LABEL[trait],
    lean: lean(trait),
    example: totals.get(trait)!.best,
  })
  const tastes = personal ? [...totals.keys()].map(taste) : []
  const likes = tastes.filter((t) => t.lean >= 0.2).sort((a, b) => b.lean - a.lean)
  const dislikes = tastes.filter((t) => t.lean <= -0.2).sort((a, b) => a.lean - b.lean)

  const fit = (kind: CookieKind) => mean(kind.traits.map(lean))
  const reasons = (kind: CookieKind) =>
    likes.filter((t) => kind.traits.includes(t.trait)).slice(0, 2)

  const tried = new Map<string, RatedCookie[]>()
  for (const { cookie, kind } of known) {
    const list = tried.get(kind.id)
    if (list) list.push(cookie)
    else tried.set(kind.id, [cookie])
  }

  const tryNext = COOKIE_KINDS.filter((kind) => !tried.has(kind.id))
    .map((kind) => ({ kind, score: (personal ? fit(kind) : 0) + (kind.classic ? 0.15 : 0) }))
    .filter((pick) => !personal || pick.score > -0.25)
    .sort((a, b) => b.score - a.score || a.kind.name.localeCompare(b.kind.name))
    .slice(0, 6)
    .map(({ kind }) => ({ kind, because: personal ? reasons(kind) : [] }))

  // Kinds you should like on paper, where the only ones you've had fell flat.
  // "On paper" means judged from every other cookie, so a bad specimen
  // doesn't get to argue against its own kind.
  const fitWithout = (kind: CookieKind) => {
    const others = tally(known.filter((entry) => entry.kind.id !== kind.id))
    return mean(kind.traits.map((trait) => leanIn(others, trait)))
  }
  const secondChances: SecondChance[] = personal
    ? [...tried]
        .map(([id, list]) => {
          const kind = COOKIE_KINDS.find((k) => k.id === id)!
          return { kind, cookie: [...list].sort(byScoreDesc)[0]!, fit: fitWithout(kind) }
        })
        .filter(({ cookie, fit }) => cookie.overallExact <= average - 0.75 && fit > 0.1)
        .sort((a, b) => b.fit - a.fit)
        .slice(0, 3)
        .map(({ kind, cookie }) => ({ kind, cookie, because: reasons(kind) }))
    : []

  // Bakeries that impressed you and still have a case full of things you haven't tried.
  const byBakery = new Map<string, RatedCookie[]>()
  for (const cookie of cookies) {
    const key = bakeryKey(cookie)
    const list = byBakery.get(key)
    if (list) list.push(cookie)
    else byBakery.set(key, [cookie])
  }
  const bar = Math.max(7, average + 0.5)
  const returnTrips: ReturnTrip[] = [...byBakery.values()]
    .map((list) => {
      const sorted = [...list].sort(byScoreDesc)
      const best = sorted[0]!
      return {
        bakery: best.bakery,
        city: best.city,
        state: best.state,
        average: mean(list.map((c) => c.overallExact)),
        count: list.length,
        best,
      }
    })
    .filter((trip) => trip.count <= 2 && trip.average >= bar)
    .sort((a, b) => b.average - a.average)
    .slice(0, 4)

  return { personal, likes, dislikes, tryNext, secondChances, returnTrips }
}

/** "caramel and toffee notes and a good chew" */
export function listTastes(tastes: Taste[]): string {
  const labels = tastes.map((t) => t.label)
  if (labels.length <= 1) return labels.join('')
  return `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`
}
