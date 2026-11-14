/**
 * Looks places up in OpenStreetMap through Photon (photon.komoot.io), a free
 * search service built on OSM data. Used for two things:
 *
 *   - finding a bakery by name while rating, to pin its exact spot
 *   - finding bakeries around a point, to suggest somewhere new
 *
 * These are the only requests the app makes about where you are. They carry
 * a search phrase and/or a map position — never your ratings — and they are
 * skipped entirely when online lookups are turned off in Settings.
 *
 * Data © OpenStreetMap contributors (ODbL).
 */
import { distanceKm, type LatLng } from '@/lib/geo'
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
  /** Straight-line distance from the search point. */
  km: number
}

/** Bakeries and pastry shops around a point, nearest first. */
export async function bakeriesNear(
  center: LatLng,
  radiusKm: number,
  signal?: AbortSignal,
): Promise<NearbyPlace[]> {
  const places = await photon(
    '/reverse',
    [
      ['lat', String(center.lat)],
      ['lon', String(center.lng)],
      ['radius', String(Math.min(50, Math.max(1, Math.round(radiusKm))))],
      ['limit', '50'],
      ['lang', 'en'],
      ['osm_tag', 'shop:bakery'],
      ['osm_tag', 'shop:pastry'],
    ],
    signal,
  )
  return places
    .map((place) => ({ ...place, km: distanceKm(center, place) }))
    .sort((a, b) => a.km - b.km)
}

/** "0.3 mi" · "12 mi" */
export function formatMiles(km: number): string {
  const miles = km * 0.621371
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`
}
