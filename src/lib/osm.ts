/**
 * Looks places up in OpenStreetMap through Photon (photon.komoot.io), a free
 * search service built on OSM data. Used for two things:
 *
 *   - finding a bakery by name while rating, to pin its exact spot
 *   - finding the bakeries in the part of the map on screen, to suggest
 *     somewhere new
 *
 * These are the only requests the app makes about where you are. They carry
 * a search phrase and/or a map position — never your ratings — and they are
 * skipped entirely when online lookups are turned off in Settings.
 *
 * Data © OpenStreetMap contributors (ODbL).
 */
import { centerOf, isWithin, reachKm, tiles, type Bounds, type LatLng } from '@/lib/geo'
import { US_STATES } from '@/lib/states'

const PHOTON = 'https://photon.komoot.io'

export interface OsmPlace extends LatLng {
  /** Stable per OSM object, e.g. `N2126676335`. */
  id: string
  name: string
  /** House number and street, when OSM has them. */
  street: string
  city: string
  /** USPS code, or '' when it couldn't be worked out. */
  state: string
  /** OSM category, e.g. `bakery`, `pastry`, `cafe`. */
  kind: string
}

interface PhotonFeature {
  properties?: {
    osm_type?: string
    osm_id?: number
    osm_key?: string
    osm_value?: string
    name?: string
    housenumber?: string
    street?: string
    city?: string
    town?: string
    village?: string
    locality?: string
    district?: string
    state?: string
    countrycode?: string
  }
  geometry?: { coordinates?: [number, number] }
}

const STATE_BY_NAME = new Map(US_STATES.map((s) => [s.name.toLowerCase(), s.code]))
const STATE_CODES = new Set(US_STATES.map((s) => s.code))

/** Photon gives "OR" for some places and "Oregon" for others. */
function stateCode(value: string | undefined): string {
  if (!value) return ''
  const upper = value.trim().toUpperCase()
  if (STATE_CODES.has(upper)) return upper
  return STATE_BY_NAME.get(value.trim().toLowerCase()) ?? ''
}

/** Turn Photon's GeoJSON into the handful of fields the app uses. */
export function parsePhoton(json: unknown): OsmPlace[] {
  const features = (json as { features?: PhotonFeature[] } | null)?.features
  if (!Array.isArray(features)) return []
  const seen = new Set<string>()
  const places: OsmPlace[] = []
  for (const feature of features) {
    const p = feature.properties
    const coordinates = feature.geometry?.coordinates
    if (!p?.name || !coordinates || p.countrycode !== 'US') continue
    const [lng, lat] = coordinates
    if (typeof lat !== 'number' || typeof lng !== 'number') continue
    const id = `${p.osm_type ?? '?'}${p.osm_id ?? `${lat},${lng}`}`
    if (seen.has(id)) continue
    seen.add(id)
    places.push({
      id,
      name: p.name.trim(),
      street: [p.housenumber, p.street].filter(Boolean).join(' '),
      city: p.city ?? p.town ?? p.village ?? p.locality ?? p.district ?? '',
      state: stateCode(p.state),
      kind: p.osm_value ?? p.osm_key ?? '',
      lat: Math.round(lat * 1e5) / 1e5,
      lng: Math.round(lng * 1e5) / 1e5,
    })
  }
  return places
}

async function photon(path: string, params: [string, string][], signal?: AbortSignal) {
  const url = new URL(path, PHOTON)
  for (const [key, value] of params) url.searchParams.append(key, value)
  const response = await fetch(url, { signal, headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`Place search failed (${response.status})`)
  return parsePhoton(await response.json())
}

/** Kinds of place that might sell a cookie, for looking one up by name. */
const SELLS_COOKIES = [
  'shop',
  'amenity:cafe',
  'amenity:restaurant',
  'amenity:fast_food',
  'amenity:ice_cream',
]

/**
 * Find a shop or café by name, favouring ones near `near` when given.
 * Meant for a short, debounced suggestion list — not bulk use.
 */
export function findBakery(
  name: string,
  near?: LatLng | null,
  signal?: AbortSignal,
): Promise<OsmPlace[]> {
  const params: [string, string][] = [
    ['q', name],
    ['limit', '6'],
    ['lang', 'en'],
    ...SELLS_COOKIES.map((tag): [string, string] => ['osm_tag', tag]),
  ]
  if (near) params.push(['lat', String(near.lat)], ['lon', String(near.lng)])
  return photon('/api/', params, signal)
}

export interface NearbyPlace extends OsmPlace {
  /** Straight-line distance from the middle of the map. */
  km: number
}

/** The most the search service hands back for one question. */
const ANSWER_LIMIT = 50
/** A crowded view is asked about again in this many squares a side. */
const SQUARES = 3
/** How many of those questions are in the air at once. */
const AT_ONCE = 3

/**
 * Up to fifty bakeries and pastry shops in a circle. The service is asked
 * not to sort by distance: sorted, a city's answer is the fifty nearest the
 * middle and nothing from the rest of the circle.
 */
function bakeriesAround(center: LatLng, radiusKm: number, signal?: AbortSignal) {
  return photon(
    '/reverse',
    [
      ['lat', String(center.lat)],
      ['lon', String(center.lng)],
      ['radius', String(Math.min(50, Math.max(1, Math.ceil(radiusKm))))],
      ['limit', String(ANSWER_LIMIT)],
      ['distance_sort', 'false'],
      ['lang', 'en'],
      ['osm_tag', 'shop:bakery'],
      ['osm_tag', 'shop:pastry'],
    ],
    signal,
  )
}

export interface BakeriesFound {
  places: OsmPlace[]
  /**
   * False when some part of the area had more bakeries than the service
   * would list, so a closer look could turn up others.
   */
  complete: boolean
}

/**
 * The bakeries and pastry shops inside a rectangle of map — all of it, edge
 * to edge, not just around its middle.
 *
 * One question covers a quiet area. Where the answer comes back full, the
 * rectangle is cut into squares and each is asked about on its own, a few
 * at a time, which is what fills in the corners of a city-sized view.
 */
export async function bakeriesWithin(bounds: Bounds, signal?: AbortSignal): Promise<BakeriesFound> {
  const whole = await bakeriesAround(centerOf(bounds), reachKm(bounds), signal)
  const answers = [whole]
  let complete = whole.length < ANSWER_LIMIT
  if (!complete) {
    const squares = tiles(bounds, SQUARES)
    complete = true
    for (let i = 0; i < squares.length; i += AT_ONCE) {
      const batch = await Promise.all(
        squares
          .slice(i, i + AT_ONCE)
          .map((square) => bakeriesAround(centerOf(square), reachKm(square), signal)),
      )
      for (const answer of batch) if (answer.length >= ANSWER_LIMIT) complete = false
      answers.push(...batch)
    }
  }
  const seen = new Set<string>()
  const places = answers.flat().filter((place) => {
    if (seen.has(place.id) || !isWithin(place, bounds)) return false
    seen.add(place.id)
    return true
  })
  return { places, complete }
}

/** "0.3 mi" · "12 mi" */
export function formatMiles(km: number): string {
  const miles = km * 0.621371
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`
}
