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
    // An online shop has nowhere to put on a map.
    if (cookie.online) continue
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
      average: mean(sorted.map((c) => c.overall)),
    })
  }
  return places.sort((a, b) => b.average - a.average || b.cookies.length - a.cookies.length)
}

/** A place in the journal: one bakery in one town, however many cookies came from it. */
export interface YourPlace {
  key: string
  bakery: string
  city: string
  state: string
  /** The pinned spot, from whichever of its cookies has one (the newest that does). */
  place: LatLng | null
  /** An online shop, with no storefront. */
  online: boolean
  /** How many cookies in the journal came from here. */
  cookies: number
  /** The most recent visit, for ordering. */
  lastEaten: string
}

/**
 * Every place in the journal, most recently visited first. Picking one for a
 * new cookie gives it the same bakery, town and pin, so the two are linked:
 * they show up together on the map and on each other's pages.
 */
export function yourPlaces(cookies: RatedCookie[]): YourPlace[] {
  const byKey = new Map<string, YourPlace>()
  const newestFirst = [...cookies].sort(
    (a, b) => b.eatenOn.localeCompare(a.eatenOn) || b.createdAt - a.createdAt,
  )
  for (const cookie of newestFirst) {
    const key = placeKey(cookie)
    const found = byKey.get(key)
    if (found) {
      found.cookies += 1
      found.place ??= cookie.place ?? null
      // Show the name the way it was written with capitals, if it ever was.
      if (found.bakery === found.bakery.toLowerCase()) found.bakery = cookie.bakery.trim()
      if (found.city === found.city.toLowerCase()) found.city = cookie.city.trim()
    } else {
      byKey.set(key, {
        key,
        bakery: cookie.bakery.trim(),
        city: cookie.city.trim(),
        state: cookie.state,
        place: cookie.place ?? null,
        online: Boolean(cookie.online),
        cookies: 1,
        lastEaten: cookie.eatenOn,
      })
    }
  }
  return [...byKey.values()]
}

/** The other cookies from the same place as this one, best first. */
export function fromSamePlace(cookie: RatedCookie, cookies: RatedCookie[]): RatedCookie[] {
  const key = placeKey(cookie)
  return cookies.filter((c) => c.id !== cookie.id && placeKey(c) === key).sort(byScoreDesc)
}

/** A "rate another one from here" link: the new cookie starts at the same place, pin and all. */
export function rateHereLink(
  place: Pick<YourPlace, 'bakery' | 'city' | 'state' | 'place'> & { online?: boolean },
): string {
  const params = new URLSearchParams({ bakery: place.bakery })
  if (place.online) params.set('online', '1')
  if (place.city) params.set('city', place.city)
  if (place.state) params.set('state', place.state)
  if (place.place) {
    params.set('lat', String(place.place.lat))
    params.set('lng', String(place.place.lng))
  }
  return `/rate?${params}`
}
