import { useEffect, useState } from 'react'
import { boundsOf, isInCounty, type County } from '@/lib/counties'
import { bakeriesWithin, type OsmPlace } from '@/lib/osm'

export type CountyBakeries =
  /** Nothing chosen, or online lookups are switched off. */
  | { status: 'idle' }
  | { status: 'looking' }
  | { status: 'failed' }
  | { status: 'ready'; places: OsmPlace[] }

/** What has been found already, so going back to a county doesn't ask again. */
const remembered = new Map<string, OsmPlace[]>()
/** A moment's pause, so tapping across several counties asks about the last one only. */
const PAUSE_MS = 350

/**
 * The bakeries and pastry shops in a county, from OpenStreetMap. Asked for
 * when a county is chosen; skipped altogether when `enabled` is false.
 */
export function useCountyBakeries(county: County | null, enabled: boolean): CountyBakeries {
  const [found, setFound] = useState<{ fips: string; state: CountyBakeries } | null>(null)
  const fips = county?.fips ?? null

  useEffect(() => {
    if (!county || !enabled || remembered.has(county.fips)) return
    const bounds = boundsOf(county)
    if (!bounds) return
    const stop = new AbortController()
    const timer = setTimeout(() => {
      setFound({ fips: county.fips, state: { status: 'looking' } })
      bakeriesWithin(bounds, stop.signal)
        .then(({ places }) => {
          // The search covers the rectangle the county sits in; keep what is
          // actually inside its lines.
          const inside = places.filter((place) => isInCounty(place, county))
          remembered.set(county.fips, inside)
          setFound({ fips: county.fips, state: { status: 'ready', places: inside } })
        })
        .catch((error: unknown) => {
          if (stop.signal.aborted) return
          console.warn(error)
          setFound({ fips: county.fips, state: { status: 'failed' } })
        })
    }, PAUSE_MS)
    return () => {
      clearTimeout(timer)
      stop.abort()
    }
  }, [county, enabled])

  if (!fips || !enabled) return { status: 'idle' }
  const known = remembered.get(fips)
  if (known) return { status: 'ready', places: known }
  // Until the pause is over and the question is out, it is as good as asked.
  return found?.fips === fips ? found.state : { status: 'looking' }
}
