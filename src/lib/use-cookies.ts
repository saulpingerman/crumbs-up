import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db } from '@/lib/db/db'
import type { CookieRecord } from '@/lib/db/schema'
import { useSettings, weightsFor } from '@/lib/settings'
import { rate, type RatedCookie } from '@/lib/stats'

/**
 * The most recent result of the journal query. A screen that mounts later
 * (coming back from a cookie's page, say) renders from this straight away
 * instead of flashing empty — which is also what lets the router put the
 * scroll position back where it was.
 */
let lastKnown: CookieRecord[] | undefined

/**
 * Every cookie in the journal with its overall score worked out from the
 * current settings. `undefined` while the very first read is in flight.
 */
export function useCookies(): RatedCookie[] | undefined {
  const settings = useSettings()
  const raw = useLiveQuery(
    async () => {
      lastKnown = await db.cookies.toArray()
      return lastKnown
    },
    [],
    lastKnown,
  )
  return useMemo(
    () => raw && rate(raw, weightsFor(settings), settings.overallPrecision),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [raw, settings.weightPreset, settings.overallPrecision],
  )
}

/** One cookie: `undefined` while loading, `null` when it doesn't exist. */
export function useCookie(id: string | undefined): RatedCookie | null | undefined {
  const settings = useSettings()
  const raw = useLiveQuery(
    async () => (id ? ((await db.cookies.get(id)) ?? null) : null),
    [id],
    // Coming from the journal, the cookie is already known.
    lastKnown?.find((c) => c.id === id),
  )
  return useMemo(
    () => (raw ? rate([raw], weightsFor(settings), settings.overallPrecision)[0]! : raw),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [raw, settings.weightPreset, settings.overallPrecision],
  )
}
