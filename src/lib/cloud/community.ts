/**
 * Fetching the Top rated totals: what everyone who is signed in has scored,
 * added up. They are public: no sign-in is needed to read them.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { fromRows, type CommunityCookie } from '@/lib/community'
import { getClient } from './client'

/** The database can add totals up but this project hasn't been told how yet. */
export class CommunityUnavailableError extends Error {
  constructor() {
    super('Top rated is not switched on for this project yet.')
    this.name = 'CommunityUnavailableError'
  }
}

/** PostgREST's ways of saying "no such function" or "no such table". */
const MISSING = new Set(['PGRST202', 'PGRST205', '42883', '42P01'])

/** A while between visits, so flicking between tabs doesn't ask again each time. */
const FRESH_FOR_MS = 5 * 60_000
let cache: { at: number; cookies: CommunityCookie[] } | null = null

/** Ask the database for the totals. */
export async function readCommunity(client: SupabaseClient): Promise<CommunityCookie[]> {
  const { data, error } = await client.rpc('community_cookies')
  if (error) {
    if (MISSING.has(error.code)) throw new CommunityUnavailableError()
    throw new Error(error.message)
  }
  return fromRows(data)
}

/** Everyone's ratings, added up per cookie. */
export async function fetchCommunity(force = false): Promise<CommunityCookie[]> {
  if (!force && cache && Date.now() - cache.at < FRESH_FOR_MS) return cache.cookies
  cache = { at: Date.now(), cookies: await readCommunity(await getClient()) }
  return cache.cookies
}

/** Forget what was fetched, so the next look is a fresh one. */
export function forgetCommunity(): void {
  cache = null
}
