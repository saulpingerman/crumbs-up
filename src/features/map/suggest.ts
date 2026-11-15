/** Working out which bakeries on the map are worth suggesting. */
import type { BakeryPlace } from '@/lib/bakery-places'
import type { OsmPlace } from '@/lib/osm'

/** "Flour & Salt Bakery" and "flour and salt" are the same shop. */
export function essence(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\b(the|bakery|bakeshop|bakehouse|baking|co|company|cafe|café|shop)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
}

/** How likely a place is to have a cookie worth rating, going by its name. */
export function promise(name: string): number {
  if (/cookie|crumbl|levain|insomnia/i.test(name)) return 1
  if (/dou?gh ?nut|bagel|pretzel|cupcake|cheesecake|tortill/i.test(name)) return -1
  return 0
}

/** The bakeries among these that aren't in the journal yet. */
export function notYetRated<T extends OsmPlace>(places: T[], mine: BakeryPlace[]): T[] {
  const visited = new Set(mine.map((p) => `${essence(p.bakery)}|${p.state}`))
  return places.filter((p) => essence(p.name) && !visited.has(`${essence(p.name)}|${p.state}`))
}

/** A link that starts a rating with what is already known about the place. */
export function rateLink(
  bakery: string,
  city: string,
  state: string,
  spot?: { lat: number; lng: number },
): string {
  const params = new URLSearchParams({ bakery, city, state })
  if (spot) {
    params.set('lat', String(spot.lat))
    params.set('lng', String(spot.lng))
  }
  return `/rate?${params}`
}
