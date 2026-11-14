/**
 * U.S. cities and towns with coordinates, bundled with the app so that city
 * suggestions and map pins work with no connection and without sending
 * anyone's whereabouts to a geocoding service.
 *
 * Data: GeoNames (CC BY 4.0). See scripts/build-places.mjs.
 */
import { distanceKm, type LatLng } from '@/lib/geo'

export interface Place extends LatLng {
  name: string
  /** USPS state code. */
  state: string
  population: number
}

type Raw = Record<string, [name: string, lat: number, lng: number, population: number][]>

/** How people actually type a few big places. Keys and values are normalized. */
const ALIASES: Record<string, Record<string, string>> = {
  NY: { 'new york': 'new york city', nyc: 'new york city', manhatten: 'manhattan' },
  DC: { washington: 'washington dc', dc: 'washington dc' },
  CA: { la: 'los angeles', sf: 'san francisco' },
  PA: { philly: 'philadelphia' },
  NV: { vegas: 'las vegas' },
  LA: { nola: 'new orleans' },
}

/** Fold case, punctuation and the usual abbreviations so names compare equal. */
export function normalizePlace(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[.,'’]/g, '')
    .replace(/\bsaint\b/g, 'st')
    .replace(/\bmount\b/g, 'mt')
    .replace(/\bfort\b/g, 'ft')
    .replace(/\s+/g, ' ')
    .trim()
}

export class PlaceIndex {
  readonly all: Place[] = []
  private readonly byKey = new Map<string, Place>()
  private readonly keys = new Map<Place, string>()

  constructor(raw: Raw) {
    for (const [state, rows] of Object.entries(raw)) {
      for (const [name, lat, lng, population] of rows) {
        const place: Place = { name, state, lat, lng, population }
        const normalized = normalizePlace(name)
        this.all.push(place)
        this.keys.set(place, normalized)
        // Rows are sorted by population, so the first of a name is the biggest.
        if (!this.byKey.has(`${normalized}|${state}`))
          this.byKey.set(`${normalized}|${state}`, place)
      }
    }
  }

  /** The place a typed city and state refer to, if it is one we know. */
  find(city: string, state: string): Place | undefined {
    const typed = normalizePlace(city)
    if (!typed) return undefined
    const name = ALIASES[state]?.[typed] ?? typed
    return this.byKey.get(`${name}|${state}`)
  }

  /**
   * Suggestions for a partly typed city. Places in `state` (when one is
   * chosen) come first, then bigger places before smaller ones.
   */
  search(query: string, state?: string, limit = 6): Place[] {
    const typed = normalizePlace(query)
    if (typed.length < 2) return []
    const scored: { place: Place; rank: number }[] = []
    for (const place of this.all) {
      const key = this.keys.get(place)!
      const starts = key.startsWith(typed)
      if (!starts && !key.includes(` ${typed}`)) continue
      const rank =
        (state && place.state === state ? 4 : 0) + (starts ? 2 : 0) + (key === typed ? 1 : 0)
      scored.push({ place, rank })
    }
    return scored
      .sort((a, b) => b.rank - a.rank || b.place.population - a.place.population)
      .slice(0, limit)
      .map((s) => s.place)
  }

  /**
   * The town someone standing at `point` would say they are in: close by,
   * but favouring a real city over a tiny neighbourhood that happens to be
   * a few blocks nearer.
   */
  nearest(point: LatLng, withinKm = 25): Place | undefined {
    let best: Place | undefined
    let bestScore = 0
    for (const place of this.all) {
      // Cheap reject before the trigonometry.
      if (Math.abs(place.lat - point.lat) > 0.4 || Math.abs(place.lng - point.lng) > 0.6) continue
      const km = distanceKm(point, place)
      if (km > withinKm) continue
      const score = (place.population + 500) / (1 + km) ** 3
      if (score > bestScore) {
        best = place
        bestScore = score
      }
    }
    return best
  }
}

let index: Promise<PlaceIndex> | null = null

/** Loads the dataset on first use (about 230 kB compressed) and keeps it. */
export function loadPlaces(): Promise<PlaceIndex> {
  index ??= import('@/data/us-places.json').then(
    (module) => new PlaceIndex(module.default as unknown as Raw),
  )
  index.catch(() => {
    index = null
  })
  return index
}
