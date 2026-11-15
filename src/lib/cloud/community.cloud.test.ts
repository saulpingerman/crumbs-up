/**
 * The Top rated totals, checked against a real database: that they add up
 * the way they claim to, that they count everyone, and (the part that
 * matters most) that they give away nothing but totals.
 *
 * Skipped unless a Supabase is configured. To run it locally:
 *
 *   npx supabase start
 *   npm run test:cloud
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'
import type { CookieRecord } from '@/lib/db/schema'
import { readCommunity } from './community'
import { SupabaseRemote } from './remote'
import { signUpConfirmed } from './test-accounts'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

const quiet = { auth: { persistSession: false, autoRefreshToken: false } }

interface Person {
  client: SupabaseClient
  remote: SupabaseRemote
  id: string
}

async function signUp(): Promise<Person> {
  const client = createClient(url!, key!, quiet)
  const user = await signUpConfirmed(
    client,
    `test-${crypto.randomUUID()}@example.com`,
    'correct horse battery staple',
  )
  return { client, remote: new SupabaseRemote(client, user.id), id: user.id }
}

function cookie(patch: Partial<CookieRecord>): CookieRecord {
  return {
    id: crypto.randomUUID(),
    createdAt: 1,
    updatedAt: 1000,
    eatenOn: '2026-03-02',
    cookieType: 'Chocolate Chip',
    bakery: 'Flour & Salt',
    city: 'Portland',
    state: 'OR',
    price: 4.5,
    place: { lat: 45.52, lng: -122.67 },
    notes: 'A secret only my journal should know',
    answers: {},
    suggested: { taste: 8, texture: 8, appearance: 8 },
    scores: { taste: 8, texture: 8, appearance: 8 },
    rubricVersion: 1,
    hasPhoto: false,
    ...patch,
  }
}

const rate = (person: Person, record: CookieRecord, deleted = false) =>
  person.remote.push([{ id: record.id, data: record, edited_at: record.updatedAt, deleted }])

describe.skipIf(!url || !key)('Top rated totals (real Supabase)', () => {
  let ana: Person
  let ben: Person
  /** Someone who never signed in. */
  let passerby: SupabaseClient
  // The database is shared with every other test run; a bakery nobody else
  // has heard of keeps these totals to themselves.
  const bakery = `Totals Bakery ${crypto.randomUUID().slice(0, 8)}`
  const here = async (client: SupabaseClient) =>
    (await readCommunity(client)).filter((c) => c.bakery.toLowerCase() === bakery.toLowerCase())

  beforeAll(async () => {
    ;[ana, ben] = await Promise.all([signUp(), signUp()])
    passerby = createClient(url!, key!, quiet)
  })

  it('adds two people’s scores for the same cookie into one line', async () => {
    await rate(ana, cookie({ bakery, scores: { taste: 9, texture: 8, appearance: 7 } }))
    // The same cookie, typed a little differently.
    await rate(
      ben,
      cookie({
        bakery: `  ${bakery.toUpperCase()}`,
        cookieType: 'chocolate chip',
        city: 'portland',
        scores: { taste: 7, texture: 6, appearance: 7 },
      }),
    )
    const totals = await here(passerby)
    expect(totals).toHaveLength(1)
    expect(totals[0]).toMatchObject({
      state: 'OR',
      raters: 2,
      scores: { taste: 8, texture: 7, appearance: 7 },
    })
    expect(totals[0]!.overall).toBeCloseTo(22 / 3)
  })

  it('counts someone who rates a cookie again once, at their own average', async () => {
    await rate(ana, cookie({ bakery, scores: { taste: 5, texture: 8, appearance: 7 } }))
    const [total] = await here(passerby)
    // Ana: (9 + 5) / 2 = 7 for taste. With Ben's 7, still two people and a 7.
    expect(total).toMatchObject({ raters: 2, scores: { taste: 7, texture: 7, appearance: 7 } })
  })

  it('keeps different cookies, and the same cookie in different towns, apart', async () => {
    await rate(ben, cookie({ bakery, cookieType: 'Snickerdoodle' }))
    await rate(ben, cookie({ bakery, city: 'Bend' }))
    const totals = await here(passerby)
    expect(totals).toHaveLength(3)
    expect(totals.filter((c) => c.cookieType.toLowerCase() === 'chocolate chip')).toHaveLength(2)
  })

  it('leaves out a cookie that has been deleted', async () => {
    const gone = cookie({ bakery, cookieType: 'Regretted' })
    await rate(ben, gone)
    expect((await here(passerby)).some((c) => c.cookieType === 'Regretted')).toBe(true)
    await rate(ben, { ...gone, updatedAt: 2000 }, true)
    expect((await here(passerby)).some((c) => c.cookieType === 'Regretted')).toBe(false)
  })

  it('counts everyone, with no way to be left out', async () => {
    // There used to be a list of people whose ratings were skipped. It is
    // gone, for the people on it and for anyone trying to add to it.
    for (const client of [ana.client, ben.client, passerby]) {
      const added = await client.from('community_optouts').insert({ user_id: ben.id })
      expect(added.error).not.toBeNull()
      const read = await client.from('community_optouts').select('user_id')
      expect(read.error).not.toBeNull()
    }
    expect(await here(passerby)).toHaveLength(3)
  })

  it('gives away totals and nothing else', async () => {
    const { data, error } = await passerby.rpc('community_cookies')
    expect(error).toBeNull()
    const rows = data as Record<string, unknown>[]
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual([
        'appearance',
        'bakery',
        'city',
        'cookie_type',
        'raters',
        'state',
        'taste',
        'texture',
      ])
    }
    const everything = JSON.stringify(rows)
    expect(everything).not.toContain(ana.id)
    expect(everything).not.toContain(ben.id)
    expect(everything).not.toContain('A secret only my journal should know')

    // And the journals themselves are as closed as ever.
    const peek = await passerby.from('cookies').select('id')
    expect(peek.data ?? []).toEqual([])
    const neighbour = await ana.client.from('cookies').select('id').eq('user_id', ben.id)
    expect(neighbour.data ?? []).toEqual([])
  })

  it('only hands over as many lines as it is asked for', async () => {
    const { data } = await passerby.rpc('community_cookies', { how_many: 1 })
    expect(data).toHaveLength(1)
  })
})
