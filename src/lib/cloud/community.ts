/**
 * Fetching the Top rated totals, and each person's choice about being
 * counted in them. The totals are public: no sign-in is needed to read them.
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

/**
 * Whether the signed-in person's ratings are counted. `null` when it can't
 * be told — the project hasn't been set up for it — and there is no choice
 * to offer.
 */
export async function readCounted(client: SupabaseClient): Promise<boolean | null> {
  const { data, error } = await client.from('community_optouts').select('user_id').limit(1)
  if (error) return null
  return data.length === 0
}

/** Join or leave the totals. Takes effect the next time they are added up. */
export async function writeCounted(
  client: SupabaseClient,
  userId: string,
  counted: boolean,
): Promise<void> {
  const { error } = counted
    ? await client.from('community_optouts').delete().eq('user_id', userId)
    : // "Already out" is fine; there is nothing to update, so only adding is allowed.
      await client.from('community_optouts').upsert({ user_id: userId }, { ignoreDuplicates: true })
  if (error) throw new Error(error.message)
}

export async function isCounted(): Promise<boolean | null> {
  return readCounted(await getClient())
}

export async function setCounted(counted: boolean): Promise<void> {
  const client = await getClient()
  const { data: who } = await client.auth.getUser()
  const userId = who.user?.id
  if (!userId) throw new Error('Not signed in.')
  await writeCounted(client, userId, counted)
  forgetCommunity()
}
