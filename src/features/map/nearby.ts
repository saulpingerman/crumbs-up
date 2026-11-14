import { distanceKm, type LatLng } from '@/lib/geo'

/** A stretch of map that has been searched for bakeries. */
export interface SearchedArea {
  center: LatLng
  radiusKm: number
}

/** The search service looks at most this far from the middle of the map. */
export const MAX_SEARCH_KM = 15
/** Beyond this the view covers too much ground for "nearby" to mean anything. */
export const TOO_WIDE_KM = 80
/** How long the map has to sit still before it is searched. */
export const SETTLE_MS = 800

/** The ground a search of this view would cover. */
export function searchArea(view: SearchedArea): SearchedArea {
  return { center: view.center, radiusKm: Math.min(MAX_SEARCH_KM, view.radiusKm) }
}

/**
 * Is this view different enough from the last one searched to be worth
 * asking again? A nudge of the map, or a small zoom, shows much the same
 * bakeries — and the search service is a shared, free one.
 */
export function worthSearching(last: SearchedArea | null, next: SearchedArea): boolean {
  if (next.radiusKm > TOO_WIDE_KM) return false
  if (!last) return true
  const area = searchArea(next)
  const moved = distanceKm(last.center, area.center)
  const resized = Math.abs(area.radiusKm - last.radiusKm) / last.radiusKm
  return moved > area.radiusKm * 0.3 || resized > 0.3
}
