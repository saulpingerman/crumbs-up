import { areaOf, covers, padded, type Bounds } from '@/lib/geo'

/** A stretch of map that has been searched for bakeries. */
export interface SearchedArea {
  bounds: Bounds
  /** False if the search service had more to give than it listed. */
  complete: boolean
}

/** What the search needs to know about what the map is showing. */
export interface Viewed {
  bounds: Bounds
  /** Roughly how far the visible map reaches from its middle. */
  radiusKm: number
}

/** Beyond this the view covers too much ground for "nearby" to mean anything. */
export const TOO_WIDE_KM = 40
/** How long the map has to sit still before it is searched. */
export const SETTLE_MS = 800
/** A search takes in a margin round the view, so a small nudge needs no new one. */
const MARGIN = 0.1

/** The ground a search of this view covers: all of it, and a little more. */
export function searchBounds(view: Viewed): Bounds {
  return padded(view.bounds, MARGIN)
}

/**
 * Is there anything to gain from searching this view? Not if it lies inside
 * ground already searched — unless that search was cut short and this is a
 * much closer look, which may turn up what was left out.
 */
export function worthSearching(last: SearchedArea | null, view: Viewed): boolean {
  if (view.radiusKm > TOO_WIDE_KM) return false
  if (!last || !covers(last.bounds, view.bounds)) return true
  return !last.complete && areaOf(view.bounds) < areaOf(last.bounds) / 2
}
