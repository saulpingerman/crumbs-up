import type { LatLng } from '@/lib/geo'
import { normalizePlace, type PlaceIndex } from '@/lib/places'
import { byScoreDesc, mean, type RatedCookie } from '@/lib/stats'

/** One bakery at one address-ish location, with every cookie rated there. */
export interface BakeryPlace {
  key: string
  bakery: string
  city: string
  state: string
  /** Where to draw it, or `null` when the city isn't one we can place. */
  position: LatLng | null
  /** True when the position came from a pinned spot rather than the town. */
  exact: boolean
  cookies: RatedCookie[]
  average: number
}

export function placeKey(c: Pick<RatedCookie, 'bakery' | 'city' | 'state'>): string {
  return `${c.bakery.trim().toLowerCase()}|${normalizePlace(c.city)}|${c.state}`
}

/**
 * Group the journal by bakery and work out where each one goes on a map:
 * the pinned spot if any of its cookies has one, otherwise its town.
 *
 * Bakeries known only by town would all land on the same dot, so they are
 * fanned out a few blocks apart around the town's center — close enough to
 * read as "in Portland", far enough to tap separately.
 */
export function bakeryPlaces(cookies: RatedCookie[], index: PlaceIndex | null): BakeryPlace[] {
  const groups = new Map<string, RatedCookie[]>()
  for (const cookie of cookies) {
    const key = placeKey(cookie)
    const group = groups.get(key)
    if (group) group.push(cookie)
    else groups.set(key, [cookie])
  }

  const perTown = new Map<string, number>()
  const places: BakeryPlace[] = []
  for (const [key, group] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const sorted = [...group].sort(byScoreDesc)
    const first = sorted[0]!
    const pinned = sorted.filter((c) => c.place)
    let position: LatLng | null = null
    if (pinned.length > 0) {
      position = {
        lat: mean(pinned.map((c) => c.place!.lat)),
        lng: mean(pinned.map((c) => c.place!.lng)),
      }
    } else {
      const town = index?.find(first.city, first.state)
      if (town) {
        const townKey = `${town.name}|${town.state}`
        const n = perTown.get(townKey) ?? 0
        perTown.set(townKey, n + 1)
        // A sunflower spiral: the first sits on the center, the rest ring it.
        const angle = n * 2.39996
        const radius = 0.0035 * Math.sqrt(n)
        position = {
          lat: town.lat + radius * Math.sin(angle),
          lng: town.lng + (radius * Math.cos(angle)) / Math.cos((town.lat * Math.PI) / 180),
        }
      }
    }
    places.push({
      key,
      bakery: first.bakery,
      city: first.city,
      state: first.state,
      position,
      exact: pinned.length > 0,
      cookies: sorted,
      average: mean(sorted.map((c) => c.overallExact)),
    })
  }
  return places.sort((a, b) => b.average - a.average || b.cookies.length - a.cookies.length)
}
