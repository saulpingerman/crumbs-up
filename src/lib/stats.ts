import type { CookieRecord } from '@/lib/db/schema'
import {
  CATEGORIES,
  assessCategory,
  overallExact,
  overallScore,
  type Category,
  type OverallPrecision,
  type Weights,
} from '@/lib/rubric'
import { ELSEWHERE } from '@/lib/states'

export interface RatedCookie extends CookieRecord {
  /** Overall score at the chosen precision — what gets displayed. */
  overall: number
  /** Unrounded overall, used to break ties when ranking. */
  overallExact: number
}

export function rate(
  cookies: CookieRecord[],
  weights: Weights,
  precision: OverallPrecision,
): RatedCookie[] {
  return cookies.map((c) => ({
    ...c,
    overall: overallScore(c.scores, weights, precision),
    overallExact: overallExact(c.scores, weights),
  }))
}

/** Best first. Ties fall back to taste, then to the more recent cookie. */
export function byScoreDesc(a: RatedCookie, b: RatedCookie): number {
  return (
    b.overallExact - a.overallExact ||
    b.scores.taste - a.scores.taste ||
    b.eatenOn.localeCompare(a.eatenOn) ||
    b.createdAt - a.createdAt
  )
}

export function byNewest(a: CookieRecord, b: CookieRecord): number {
  return b.eatenOn.localeCompare(a.eatenOn) || b.createdAt - a.createdAt
}

export function mean(values: number[]): number {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0
}

export interface Group {
  key: string
  label: string
  count: number
  average: number
  best: RatedCookie
  cookies: RatedCookie[]
}

export function groupBy(
  cookies: RatedCookie[],
  keyOf: (c: RatedCookie) => { key: string; label: string },
): Group[] {
  const map = new Map<string, { label: string; cookies: RatedCookie[] }>()
  for (const c of cookies) {
    const { key, label } = keyOf(c)
    const group = map.get(key)
    if (group) group.cookies.push(c)
    else map.set(key, { label, cookies: [c] })
  }
  return [...map].map(([key, g]) => {
    const sorted = [...g.cookies].sort(byScoreDesc)
    return {
      key,
      label: g.label,
      count: sorted.length,
      // Averages are of the scores as shown, so a group of one reads the
      // same as its cookie.
      average: mean(sorted.map((c) => c.overall)),
      best: sorted[0]!,
      cookies: sorted,
    }
  })
}

export const byAverageDesc = (a: Group, b: Group) => b.average - a.average || b.count - a.count

export function bakeryKey(c: Pick<CookieRecord, 'bakery' | 'state'>): string {
  return `${c.bakery.trim().toLowerCase()}|${c.state}`
}

export const groupByBakery = (cookies: RatedCookie[]) =>
  groupBy(cookies, (c) => ({ key: bakeryKey(c), label: c.bakery }))

export const groupByType = (cookies: RatedCookie[]) =>
  groupBy(cookies, (c) => ({ key: c.cookieType.trim().toLowerCase(), label: c.cookieType }))

export const groupByState = (cookies: RatedCookie[]) =>
  groupBy(cookies, (c) => ({ key: c.state, label: c.state }))

export interface Summary {
  count: number
  average: number
  categoryAverages: Record<Category, number>
  bakeries: number
  /** Distinct U.S. states (plus DC) with at least one cookie. */
  states: number
  best?: RatedCookie
  aboveStandard: number
}

export function summarize(cookies: RatedCookie[]): Summary {
  const categoryAverages = Object.fromEntries(
    CATEGORIES.map((c) => [c, mean(cookies.map((k) => k.scores[c]))]),
  ) as Record<Category, number>
  return {
    count: cookies.length,
    average: mean(cookies.map((c) => c.overall)),
    categoryAverages,
    bakeries: new Set(cookies.map(bakeryKey)).size,
    states: new Set(cookies.map((c) => c.state).filter((s) => s !== ELSEWHERE.code)).size,
    best: [...cookies].sort(byScoreDesc)[0],
    aboveStandard: cookies.filter((c) => c.overallExact > 5).length,
  }
}

/** Count of cookies per whole-point band: index 0 is 1–1.9 … index 9 is a 10. */
export function distribution(cookies: RatedCookie[]): { band: number; count: number }[] {
  const bands = Array.from({ length: 10 }, (_, i) => ({ band: i + 1, count: 0 }))
  for (const c of cookies) {
    const index = Math.min(9, Math.max(0, Math.floor(c.overall) - 1))
    bands[index]!.count += 1
  }
  return bands
}

export interface Disagreement {
  /** Cookies scored with the questionnaire (hand-entered ones don't count). */
  count: number
  byCategory: Record<
    Category,
    {
      /** Average of (what you recorded − what the questions suggested). */
      average: number
      /** How many suggestions you changed. */
      moved: number
    }
  >
}

/**
 * How your final scores compare with what the questionnaire suggested.
 * A steady gap in one direction means the questions run hot or cold for
 * your taste in that category — the signal for tuning the rubric.
 */
export function disagreement(cookies: CookieRecord[]): Disagreement {
  const guided = cookies.filter((c) =>
    CATEGORIES.every((cat) => assessCategory(cat, c.answers).complete),
  )
  const byCategory = Object.fromEntries(
    CATEGORIES.map((cat) => {
      const deltas = guided.map((c) => c.scores[cat] - c.suggested[cat])
      return [cat, { average: mean(deltas), moved: deltas.filter((d) => d !== 0).length }]
    }),
  ) as Disagreement['byCategory']
  return { count: guided.length, byCategory }
}
