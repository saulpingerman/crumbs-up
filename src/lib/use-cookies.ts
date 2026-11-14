import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db } from '@/lib/db/db'
import { useSettings, weightsFor } from '@/lib/settings'
import { rate, type RatedCookie } from '@/lib/stats'

/**
 * Every cookie in the journal with its overall score worked out from the
 * current settings. `undefined` while the first read is in flight.
 */
export function useCookies(): RatedCookie[] | undefined {
  const settings = useSettings()
  const raw = useLiveQuery(() => db.cookies.toArray(), [])
  return useMemo(
    () => raw && rate(raw, weightsFor(settings), settings.overallPrecision),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [raw, settings.weightPreset, settings.overallPrecision],
  )
}

/** One cookie: `undefined` while loading, `null` when it doesn't exist. */
export function useCookie(id: string | undefined): RatedCookie | null | undefined {
  const settings = useSettings()
  const raw = useLiveQuery(async () => (id ? ((await db.cookies.get(id)) ?? null) : null), [id])
  return useMemo(
    () => (raw ? rate([raw], weightsFor(settings), settings.overallPrecision)[0]! : raw),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [raw, settings.weightPreset, settings.overallPrecision],
  )
}
