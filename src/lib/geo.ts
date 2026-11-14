import { geoAlbersUsa } from 'd3-geo'

export interface LatLng {
  lat: number
  lng: number
}

/**
 * The projection the us-atlas "albers" shapes were drawn with: the lower 48
 * in an Albers conic, with Alaska and Hawaii tucked in below, in a 975×610
 * box. Projecting a coordinate with it lands on the same map.
 */
const albers = geoAlbersUsa().scale(1300).translate([487.5, 305])

/** Map position for a coordinate, or `null` if it is outside the fifty states. */
export function project(point: LatLng): [x: number, y: number] | null {
  return albers([point.lng, point.lat])
}

const EARTH_KM = 6371

export function distanceKm(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * A link that opens the phone's maps app (or a maps website) searching for
 * a bakery by name and town — which finds the actual business, with hours
 * and directions, better than bare coordinates would.
 */
export function mapsUrl(bakery: string, city: string, state: string): string {
  const query = [bakery, city, state].filter(Boolean).join(', ')
  const apple =
    typeof navigator !== 'undefined' &&
    (/iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent) || navigator.platform === 'MacIntel')
  return apple
    ? `https://maps.apple.com/?q=${encodeURIComponent(query)}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}
