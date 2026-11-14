/**
 * Cookies by town. A state is a big place to have "been" — a town is where
 * a bakery actually is, so towns are what the journal counts and filters by.
 */
import type { CookieRecord } from '@/lib/db/schema'
import { distanceKm, type LatLng } from '@/lib/geo'
import { normalizePlace, type Place, type PlaceIndex } from '@/lib/places'
import { ELSEWHERE } from '@/lib/states'

type Located = Pick<CookieRecord, 'city' | 'state'>

/** One key per town however its name was typed, or '' for a cookie with no town. */
export function townKey(cookie: Located): string {
  const city = normalizePlace(cookie.city)
  return city ? `${city}|${cookie.state}` : ''
}

/** "State College, PA" — or just the town for somewhere outside the U.S. */
export function townLabel(cookie: Located): string {
  const city = cookie.city.trim()
  return cookie.state === ELSEWHERE.code ? city : `${city}, ${cookie.state}`
}

/** How many different towns these cookies come from. */
export function countTowns(cookies: Located[]): number {
  return new Set(cookies.map(townKey).filter(Boolean)).size
}

/** A town worth a trip: near somewhere already in the journal, with no cookie logged yet. */
export interface NearbyTown extends LatLng {
  name: string
  state: string
  /** Distance from the nearest town that is in the journal. */
  km: number
  /** That town's name. */
  from: string
}

/** Further than this isn't "nearby" any more (about 40 miles). */
const REACH_KM = 65
/** Closer than this is the same town by another name: a suburb, a neighbourhood. */
const SAME_PLACE_KM = 5.5
/** Smaller places than this rarely have a bakery to find. */
const SMALLEST = 2500

/**
 * Towns close to ones in the journal where no cookie has been logged yet:
 * nearer and bigger first. Somewhere new to go that isn't a whole state away.
 */
export function newTowns(
  cookies: Pick<CookieRecord, 'city' | 'state' | 'place'>[],
  index: PlaceIndex,
  limit = 6,
): NearbyTown[] {
  // Where the journal has been: the town typed in, or the one a pinned spot is in.
  const been = new Set<Place>()
  for (const cookie of cookies) {
    const town =
      index.find(cookie.city, cookie.state) ?? (cookie.place ? index.nearest(cookie.place) : null)
    if (town) been.add(town)
  }
  if (been.size === 0) return []
  const anchors = [...been]

  const found: (NearbyTown & { pull: number })[] = []
  for (const place of index.all) {
    if (place.population < SMALLEST || been.has(place)) continue
    let nearest: Place | null = null
    let km = Infinity
    for (const anchor of anchors) {
      // Cheap reject before the trigonometry.
      if (Math.abs(place.lat - anchor.lat) > 0.7 || Math.abs(place.lng - anchor.lng) > 1) continue
      const d = distanceKm(place, anchor)
      if (d < km) {
        km = d
        nearest = anchor
      }
    }
    if (!nearest || km > REACH_KM) continue
    // Right on top of somewhere already visited: not new ground.
    if (km < SAME_PLACE_KM) continue
    found.push({
      name: place.name,
      state: place.state,
      lat: place.lat,
      lng: place.lng,
      km,
      from: nearest.name,
      // Bigger towns pull harder, distance pushes back.
      pull: place.population ** 0.35 / (km + 8),
    })
  }
  return found
    .sort((a, b) => b.pull - a.pull)
    .slice(0, limit)
    .map(({ pull: _pull, ...town }) => town)
}
