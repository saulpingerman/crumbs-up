import { geoAlbersUsa } from 'd3-geo'

export interface LatLng {
  lat: number
  lng: number
}

/** A rectangle of map: what a map view shows, or a part of it. */
export interface Bounds {
  south: number
  west: number
  north: number
  east: number
}

export function centerOf(bounds: Bounds): LatLng {
  return { lat: (bounds.south + bounds.north) / 2, lng: (bounds.west + bounds.east) / 2 }
}

/** Is this spot inside the rectangle? */
export function isWithin(point: LatLng, bounds: Bounds): boolean {
  return (
    point.lat >= bounds.south &&
    point.lat <= bounds.north &&
    point.lng >= bounds.west &&
    point.lng <= bounds.east
  )
}

/** Does `outer` take in all of `inner`? */
export function covers(outer: Bounds, inner: Bounds): boolean {
  return (
    outer.south <= inner.south &&
    outer.north >= inner.north &&
    outer.west <= inner.west &&
    outer.east >= inner.east
  )
}

/** The rectangle grown on every side by a share of its own size (0.1 = 10%). */
export function padded(bounds: Bounds, share: number): Bounds {
  const tall = (bounds.north - bounds.south) * share
  const wide = (bounds.east - bounds.west) * share
  return {
    south: bounds.south - tall,
    north: bounds.north + tall,
    west: bounds.west - wide,
    east: bounds.east + wide,
  }
}

/** Cut the rectangle into `across` × `across` equal pieces. */
export function tiles(bounds: Bounds, across: number): Bounds[] {
  const tall = (bounds.north - bounds.south) / across
  const wide = (bounds.east - bounds.west) / across
  return Array.from({ length: across * across }, (_, i) => {
    const row = Math.floor(i / across)
    const column = i % across
    return {
      south: bounds.south + tall * row,
      north: bounds.south + tall * (row + 1),
      west: bounds.west + wide * column,
      east: bounds.west + wide * (column + 1),
    }
  })
}

/** How much ground the rectangle covers, near enough for comparing two of them. */
export function areaOf(bounds: Bounds): number {
  return (bounds.north - bounds.south) * (bounds.east - bounds.west)
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

/** The coordinate at a map position: `project` the other way round. */
export function unproject(spot: [x: number, y: number]): LatLng | null {
  const found = albers.invert?.(spot)
  return found ? { lat: found[1], lng: found[0] } : null
}

/**
 * The smallest rectangle of the world that takes in a box on the drawn map
 * (left, top, right, bottom). The drawn map is tilted against the lines of
 * latitude and longitude, so the box's corners and the middles of its sides
 * are all looked at.
 */
export function worldBounds(box: [number, number, number, number]): Bounds | null {
  const [left, top, right, bottom] = box
  const midX = (left + right) / 2
  const midY = (top + bottom) / 2
  const spots = (
    [
      [left, top],
      [midX, top],
      [right, top],
      [right, midY],
      [right, bottom],
      [midX, bottom],
      [left, bottom],
      [left, midY],
    ] as [number, number][]
  )
    .map(unproject)
    .filter((spot) => spot !== null)
  if (spots.length === 0) return null
  return {
    south: Math.min(...spots.map((s) => s.lat)),
    north: Math.max(...spots.map((s) => s.lat)),
    west: Math.min(...spots.map((s) => s.lng)),
    east: Math.max(...spots.map((s) => s.lng)),
  }
}

/**
 * How far "north" leans from straight up at a map position, in degrees
 * clockwise. The country is drawn on a cone, so only its middle stands
 * upright: Maine leans one way and Washington the other.
 */
export function lean(spot: [x: number, y: number]): number {
  const here = unproject(spot)
  if (!here) return 0
  const above = project({ lat: here.lat + 0.25, lng: here.lng })
  const below = project({ lat: here.lat - 0.25, lng: here.lng })
  if (!above || !below) return 0
  return (Math.atan2(above[0] - below[0], below[1] - above[1]) * 180) / Math.PI
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

/** How far the rectangle's corners are from its middle. */
export function reachKm(bounds: Bounds): number {
  return distanceKm(centerOf(bounds), { lat: bounds.north, lng: bounds.east })
}
