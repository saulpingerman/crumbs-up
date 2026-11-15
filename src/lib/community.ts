/**
 * Top rated: everyone's scores for a cookie, added up.
 *
 * The totals arrive already added up (see supabase/migrations/…_community.sql);
 * nothing here ever sees an individual's journal. This file only sorts and
 * groups them.
 */
import { normalizePlace } from '@/lib/places'
import { CATEGORIES, type Scores } from '@/lib/rubric'
import { ELSEWHERE } from '@/lib/states'

/** One cookie at one bakery in one town, as everyone scored it. */
export interface CommunityCookie {
  cookieType: string
  bakery: string
  city: string
  state: string
  /** How many people rated it. */
  raters: number
  /** Their average for each category. */
  scores: Scores
  /** The plain average of the three: the same for everyone looking. */
  overall: number
}

/** A row as the database hands it over. */
export interface CommunityRow {
  cookie_type: string
  bakery: string
  city: string | null
  state: string | null
  raters: number
  taste: number | string
  texture: number | string
  appearance: number | string
}

/** Tidy the database's rows, dropping any that don't hold together. */
export function fromRows(rows: unknown): CommunityCookie[] {
  if (!Array.isArray(rows)) return []
  const cookies: CommunityCookie[] = []
  for (const row of rows as Partial<CommunityRow>[]) {
    const scores = {
      taste: Number(row.taste),
      texture: Number(row.texture),
      appearance: Number(row.appearance),
    }
    const raters = Number(row.raters)
    if (!row.cookie_type || !row.bakery || !(raters >= 1)) continue
    if (CATEGORIES.some((c) => !(scores[c] >= 1 && scores[c] <= 10))) continue
    cookies.push({
      cookieType: row.cookie_type,
      bakery: row.bakery,
      city: row.city ?? '',
      state: row.state ?? '',
      raters,
      scores,
      overall: (scores.taste + scores.texture + scores.appearance) / 3,
    })
  }
  return cookies
}

/**
 * How much one person's opinion is trusted before others have weighed in.
 * A single perfect ten shouldn't outrank a nine that twenty people agree
 * on, so every cookie starts with this many votes for "about average".
 */
const BENEFIT_OF_DOUBT = 2

/** The score a list is ordered by: the average, pulled toward the middle while few have rated. */
function standing(overall: number, raters: number, typical: number): number {
  return (overall * raters + typical * BENEFIT_OF_DOUBT) / (raters + BENEFIT_OF_DOUBT)
}

function typicalScore(cookies: { overall: number; raters: number }[]): number {
  const raters = cookies.reduce((sum, c) => sum + c.raters, 0)
  return raters ? cookies.reduce((sum, c) => sum + c.overall * c.raters, 0) / raters : 5
}

/** One key per town, however its name was typed; '' when there is no town. */
export function communityTownKey(cookie: Pick<CommunityCookie, 'city' | 'state'>): string {
  const city = normalizePlace(cookie.city)
  return city ? `${city}|${cookie.state}` : ''
}

/** "Portland, OR" */
export function communityTownLabel(cookie: Pick<CommunityCookie, 'city' | 'state'>): string {
  if (!cookie.city) return ''
  return cookie.state && cookie.state !== ELSEWHERE.code
    ? `${cookie.city}, ${cookie.state}`
    : cookie.city
}

/** The towns the totals cover, by name, for narrowing the lists down. */
export function communityTowns(cookies: CommunityCookie[]): { key: string; label: string }[] {
  const towns = new Map<string, string>()
  for (const cookie of cookies) {
    const key = communityTownKey(cookie)
    if (key && !towns.has(key)) towns.set(key, communityTownLabel(cookie))
  }
  return [...towns]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

/** Only the cookies from one town (all of them when no town is chosen). */
export function inTown(cookies: CommunityCookie[], town: string): CommunityCookie[] {
  return town ? cookies.filter((c) => communityTownKey(c) === town) : cookies
}

/** Best first. */
export function rankCookies(cookies: CommunityCookie[]): CommunityCookie[] {
  const typical = typicalScore(cookies)
  return [...cookies].sort(
    (a, b) =>
      standing(b.overall, b.raters, typical) - standing(a.overall, a.raters, typical) ||
      b.raters - a.raters ||
      a.cookieType.localeCompare(b.cookieType),
  )
}

/** Several cookies taken together: a bakery's, or every one of a kind. */
export interface CommunityGroup {
  key: string
  /** The bakery's name, or the kind of cookie. */
  name: string
  /** Where it is, for a bakery. */
  place: string
  /** How many different cookies are in it. */
  cookies: number
  /** How many ratings went into it (someone who rated two of its cookies counts twice). */
  ratings: number
  scores: Scores
  overall: number
  /** Its best cookie. */
  best: CommunityCookie
}

function group(
  cookies: CommunityCookie[],
  describe: (cookie: CommunityCookie) => { key: string; name: string; place: string },
): CommunityGroup[] {
  const groups = new Map<string, { name: string; place: string; members: CommunityCookie[] }>()
  for (const cookie of cookies) {
    const { key, name, place } = describe(cookie)
    const found = groups.get(key)
    if (found) found.members.push(cookie)
    else groups.set(key, { name, place, members: [cookie] })
  }
  const typical = typicalScore(cookies)
  return [...groups]
    .map(([key, { name, place, members }]): CommunityGroup => {
      const ratings = members.reduce((sum, c) => sum + c.raters, 0)
      // Every rating counts the same, whichever cookie it was for.
      const average = (pick: (c: CommunityCookie) => number) =>
        members.reduce((sum, c) => sum + pick(c) * c.raters, 0) / ratings
      const scores = {
        taste: average((c) => c.scores.taste),
        texture: average((c) => c.scores.texture),
        appearance: average((c) => c.scores.appearance),
      }
      return {
        key,
        name,
        place,
        cookies: members.length,
        ratings,
        scores,
        overall: average((c) => c.overall),
        best: rankCookies(members)[0]!,
      }
    })
    .sort(
      (a, b) =>
        standing(b.overall, b.ratings, typical) - standing(a.overall, a.ratings, typical) ||
        b.ratings - a.ratings ||
        a.name.localeCompare(b.name),
    )
}

/** Bakeries, best first, each judged on everything rated there. */
export function rankBakeries(cookies: CommunityCookie[]): CommunityGroup[] {
  return group(cookies, (c) => ({
    key: `${c.bakery.trim().toLowerCase()}|${communityTownKey(c)}|${c.state}`,
    name: c.bakery,
    place: communityTownLabel(c),
  }))
}

/** Kinds of cookie, best first: how chocolate chip does against snickerdoodle. */
export function rankTypes(cookies: CommunityCookie[]): CommunityGroup[] {
  return group(cookies, (c) => ({
    key: c.cookieType.trim().toLowerCase(),
    name: c.cookieType,
    place: '',
  }))
}

/** Is this the same cookie as one in a journal? */
export function sameCookie(
  a: Pick<CommunityCookie, 'cookieType' | 'bakery' | 'city' | 'state'>,
  b: { cookieType: string; bakery: string; city: string; state: string },
): boolean {
  return (
    a.cookieType.trim().toLowerCase() === b.cookieType.trim().toLowerCase() &&
    a.bakery.trim().toLowerCase() === b.bakery.trim().toLowerCase() &&
    normalizePlace(a.city) === normalizePlace(b.city) &&
    a.state === b.state
  )
}
