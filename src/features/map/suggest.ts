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
  // "Donut" as well as "doughnut": the short spelling is the common one on shop signs.
  if (/do(?:ugh)? ?nut|bagel|pretzel|cupcake|cheesecake|tortill/i.test(name)) return -1
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

/** A place to try, as a list shows it. */
export interface Suggestion {
  key: string
  name: string
  /** Its address — or, for a chain, the towns it is in. */
  detail: string
  /** The place a "rate here" link starts from. */
  place: OsmPlace
  /** How many shops this stands for: more than one for a chain. */
  shops: number
}

const address = (place: OsmPlace) => [place.street, place.city].filter(Boolean).join(', ')

/** Each place on its own line. */
export function asSuggestions(places: OsmPlace[]): Suggestion[] {
  return places.map((place) => ({
    key: place.id,
    name: place.name,
    detail: address(place),
    place,
    shops: 1,
  }))
}

/**
 * The same, with a chain's many shops folded into one line that names a few
 * of its towns: seventeen rows of one cookie chain would bury the one-off
 * shops, which are the more interesting find. One-offs come first.
 */
export function foldChains(places: OsmPlace[]): Suggestion[] {
  const byName = new Map<string, OsmPlace[]>()
  for (const place of places) {
    const key = essence(place.name)
    const shops = byName.get(key)
    if (shops) shops.push(place)
    else byName.set(key, [place])
  }
  const folded = [...byName].map(([key, shops]): Suggestion => {
    const first = shops[0]!
    if (shops.length === 1) {
      return { key, name: first.name, detail: address(first), place: first, shops: 1 }
    }
    const towns = [...new Set(shops.map((shop) => shop.city).filter(Boolean))]
    const named = towns.slice(0, 3).join(', ')
    const more = towns.length - 3
    return {
      key,
      name: first.name,
      detail: `${shops.length} shops${named ? `: ${named}` : ''}${more > 0 ? ` and ${more} more towns` : ''}`,
      place: first,
      shops: shops.length,
    }
  })
  return folded.sort((a, b) => a.shops - b.shops || a.name.localeCompare(b.name))
}
