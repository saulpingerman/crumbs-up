import { useEffect, useState } from 'react'
import type { OsmPlace } from '@/lib/osm'

export type PlacesLookup =
  /** Nothing chosen, or online lookups are switched off. */
  | { status: 'idle' }
  | { status: 'looking' }
  | { status: 'failed' }
  | { status: 'ready'; places: OsmPlace[] }

/** What has been found already, so going back to an area doesn't ask again. */
const remembered = new Map<string, OsmPlace[]>()
/** A moment's pause, so tapping across several areas asks about the last one only. */
const PAUSE_MS = 350

/**
 * Places in an area (a county, a state), from OpenStreetMap. Asked for when
 * the area is chosen, once; skipped altogether when `enabled` is false.
 *
 * @param area A name for the area that is the same every time, or `null` for none.
 * @param ask How to find its places. Only called when they aren't known yet.
 */
export function usePlacesLookup(
  area: string | null,
  enabled: boolean,
  ask: (signal: AbortSignal) => Promise<OsmPlace[]>,
): PlacesLookup {
  const [found, setFound] = useState<{ area: string; state: PlacesLookup } | null>(null)

  useEffect(() => {
    if (!area || !enabled || remembered.has(area)) return
    const stop = new AbortController()
    const timer = setTimeout(() => {
      setFound({ area, state: { status: 'looking' } })
      ask(stop.signal)
        .then((places) => {
          remembered.set(area, places)
          setFound({ area, state: { status: 'ready', places } })
        })
        .catch((error: unknown) => {
          if (stop.signal.aborted) return
          console.warn(error)
          setFound({ area, state: { status: 'failed' } })
        })
    }, PAUSE_MS)
    return () => {
      clearTimeout(timer)
      stop.abort()
    }
    // `ask` is made afresh on every render; the area is what says it has changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area, enabled])

  if (!area || !enabled) return { status: 'idle' }
  const known = remembered.get(area)
  if (known) return { status: 'ready', places: known }
  // Until the pause is over and the question is out, it is as good as asked.
  return found?.area === area ? found.state : { status: 'looking' }
}
