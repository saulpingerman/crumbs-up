/**
 * Checks the real database rules against a running Supabase — the part no
 * in-memory fake can vouch for: that one person can never read or change
 * another person's journal or photos.
 *
 * Skipped unless a Supabase is configured. To run it locally:
 *
 *   npx supabase start
 *   npm run test:cloud
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'
import { noteChange } from '@/lib/db/cookies'
import { CrumbsDb } from '@/lib/db/db'
import type { CookieRecord, PhotoImages } from '@/lib/db/schema'
import { deleteAccount } from './account'
import { SupabaseRemote } from './remote'
import { sync, type SyncTools } from './sync'
import { signUpConfirmed } from './test-accounts'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

const bytes = (...values: number[]) => new Uint8Array(values).buffer
const read = (buffer: ArrayBuffer | null | undefined) =>
  buffer ? [...new Uint8Array(buffer)] : null
/** A tiny but genuine JPEG header, so the bucket's "JPEG only" rule is satisfied. */
const jpeg = (...tail: number[]) => bytes(0xff, 0xd8, 0xff, 0xe0, ...tail)

function cookie(id: string, updatedAt: number, patch: Partial<CookieRecord> = {}): CookieRecord {
  return {
    id,
    createdAt: 1,
    updatedAt,
    eatenOn: '2026-03-02',
    cookieType: 'Chocolate Chip',
    bakery: 'Flour & Salt',
    city: 'Portland',
    state: 'OR',
    price: 4.5,
    place: { lat: 45.52, lng: -122.67 },
    notes: 'Crisp edges',
    answers: { 'taste.depth': 'taste.depth.5', 'taste.flaws': [] },
    suggested: { taste: 8, texture: 7, appearance: 6.5 },
    scores: { taste: 8.5, texture: 7, appearance: 6.5 },
    rubricVersion: 1,
    hasPhoto: false,
    ...patch,
  }
}

const PASSWORD = 'correct horse battery staple'

async function signUp(): Promise<{
  client: SupabaseClient
  remote: SupabaseRemote
  id: string
  email: string
}> {
  const client = createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const email = `test-${crypto.randomUUID()}@example.com`
  const user = await signUpConfirmed(client, email, PASSWORD)
  return { client, remote: new SupabaseRemote(client, user.id), id: user.id, email }
}

const tools: SyncTools = {
  describePhoto: async (full): Promise<PhotoImages> => ({
    mime: 'image/jpeg',
    full,
    thumb: full.slice(0, 4),
    width: 4,
    height: 3,
    thumbWidth: 2,
    thumbHeight: 1,
  }),
}

describe.skipIf(!url || !key)('cloud journal (real Supabase)', () => {
  let ana: Awaited<ReturnType<typeof signUp>>
  let ben: Awaited<ReturnType<typeof signUp>>

  beforeAll(async () => {
    ;[ana, ben] = await Promise.all([signUp(), signUp()])
  })

  it('stores and returns a person’s cookies exactly', async () => {
    const id = crypto.randomUUID()
    const record = cookie(id, 1000)
    await ana.remote.push([{ id, data: record, edited_at: 1000, deleted: false }])

    const rows = await ana.remote.pull(null)
    const row = rows.find((r) => r.id === id)!
    expect(row.data).toEqual(record)
    expect(row.edited_at).toBe(1000)
    expect(row.deleted).toBe(false)
    expect(Number.isNaN(Date.parse(row.changed_at))).toBe(false)
  })

  it('keeps the newest edit, whatever order they arrive in', async () => {
    const id = crypto.randomUUID()
    await ana.remote.push([
      { id, data: cookie(id, 2000, { notes: 'newer' }), edited_at: 2000, deleted: false },
    ])
    // An older copy turning up late must not win.
    await ana.remote.push([
      { id, data: cookie(id, 1500, { notes: 'older' }), edited_at: 1500, deleted: false },
    ])
    let row = (await ana.remote.pull(null)).find((r) => r.id === id)!
    expect((row.data as CookieRecord).notes).toBe('newer')

    await ana.remote.push([
      { id, data: cookie(id, 3000, { notes: 'newest' }), edited_at: 3000, deleted: false },
    ])
    row = (await ana.remote.pull(null)).find((r) => r.id === id)!
    expect((row.data as CookieRecord).notes).toBe('newest')
  })

  it('only returns what changed since the cursor', async () => {
    const first = crypto.randomUUID()
    await ana.remote.push([{ id: first, data: cookie(first, 1), edited_at: 1, deleted: false }])
    const cursor = (await ana.remote.pull(null)).at(-1)!.changed_at

    // Step past the overlap the client deliberately re-reads.
    const later = new Date(Date.parse(cursor) + 60_000).toISOString()
    expect(await ana.remote.pull(later)).toEqual([])

    const second = crypto.randomUUID()
    await ana.remote.push([{ id: second, data: cookie(second, 2), edited_at: 2, deleted: false }])
    expect((await ana.remote.pull(cursor)).map((r) => r.id)).toContain(second)
  })

  it('reads a journal too long for one page without dropping or repeating a cookie', async () => {
    const { remote } = await signUp()
    const ids = Array.from({ length: 1150 }, () => crypto.randomUUID())
    // Sent in a few goes, so many rows share the moment they were written.
    for (let start = 0; start < ids.length; start += 400) {
      await remote.push(
        ids.slice(start, start + 400).map((id, i) => ({
          id,
          data: cookie(id, start + i),
          edited_at: start + i,
          deleted: false,
        })),
      )
    }
    const rows = await remote.pull(null)
    expect(rows.length).toBe(ids.length)
    expect(new Set(rows.map((row) => row.id)).size).toBe(ids.length)
    // In the order they changed, which is what the cursor relies on.
    const stamps = rows.map((row) => row.changed_at)
    expect([...stamps].sort()).toEqual(stamps)
  }, 60_000)

  it('says what the cloud holds for the cookies asked about, and only those', async () => {
    const { remote } = await signUp()
    const [a, b, never] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()]
    await remote.push([
      { id: a, data: cookie(a, 10), edited_at: 10, deleted: false },
      { id: b, data: {}, edited_at: 20, deleted: true },
    ])
    const held = await remote.current([a, b, never])
    expect(held.map((row) => [row.id, row.edited_at, row.deleted]).sort()).toEqual(
      [
        [a, 10, false],
        [b, 20, true],
      ].sort(),
    )
    expect(await remote.current([])).toEqual([])
  })

  it('never shows one person’s cookies to another', async () => {
    const id = crypto.randomUUID()
    await ana.remote.push([
      { id, data: cookie(id, 10, { notes: 'private' }), edited_at: 10, deleted: false },
    ])

    expect((await ben.remote.pull(null)).some((r) => r.id === id)).toBe(false)
    const direct = await ben.client.from('cookies').select('id').eq('id', id)
    expect(direct.data).toEqual([])
  })

  it('never lets one person change or delete another’s cookies', async () => {
    const id = crypto.randomUUID()
    await ana.remote.push([
      { id, data: cookie(id, 10, { notes: 'mine' }), edited_at: 10, deleted: false },
    ])

    // Using the same id only ever creates a row of Ben's own…
    await ben.remote.push([
      { id, data: cookie(id, 99, { notes: 'hijacked' }), edited_at: 99, deleted: false },
    ])
    expect((await ben.remote.pull(null)).find((r) => r.id === id)?.data).toMatchObject({
      notes: 'hijacked',
    })
    // …direct attempts on Ana's row match nothing…
    await ben.client.from('cookies').update({ deleted: true, edited_at: 500 }).eq('user_id', ana.id)
    await ben.client.from('cookies').delete().eq('user_id', ana.id)
    // …and planting a row under her name is refused.
    const planted = await ben.client
      .from('cookies')
      .insert({ id: crypto.randomUUID(), user_id: ana.id, data: {}, edited_at: 1 })
    expect(planted.error).not.toBeNull()

    const row = (await ana.remote.pull(null)).find((r) => r.id === id)!
    expect(row.deleted).toBe(false)
    expect((row.data as CookieRecord).notes).toBe('mine')
  })

  it('gives someone who is not signed in nothing at all', async () => {
    const anonymous = createClient(url!, key!, { auth: { persistSession: false } })
    const reading = await anonymous.from('cookies').select('id').limit(1)
    expect(reading.data ?? []).toEqual([])
    const writing = await anonymous
      .from('cookies')
      .insert({ id: crypto.randomUUID(), data: {}, edited_at: 1 })
    expect(writing.error).not.toBeNull()
    const photo = await anonymous.storage.from('photos').download(`${ana.id}/anything/full.jpg`)
    expect(photo.data).toBeNull()
  })

  it('stores photos privately, per person', async () => {
    const id = crypto.randomUUID()
    await ana.remote.uploadPhoto(id, 'full', jpeg(1, 2, 3))
    await ana.remote.uploadPhoto(id, 'original', jpeg(9))
    expect(read(await ana.remote.downloadPhoto(id, 'full'))).toEqual(read(jpeg(1, 2, 3)))

    // Replacing works…
    await ana.remote.uploadPhoto(id, 'full', jpeg(4, 5))
    expect(read(await ana.remote.downloadPhoto(id, 'full'))).toEqual(read(jpeg(4, 5)))

    // …a missing photo is just "not there"…
    expect(await ana.remote.downloadPhoto(crypto.randomUUID(), 'full')).toBeNull()

    // …and nobody else can fetch, overwrite or remove it.
    const path = `${ana.id}/${id}/full.jpg`
    expect((await ben.client.storage.from('photos').download(path)).data).toBeNull()
    const overwrite = await ben.client.storage
      .from('photos')
      .upload(path, new Blob([jpeg(6)], { type: 'image/jpeg' }), {
        upsert: true,
        contentType: 'image/jpeg',
      })
    expect(overwrite.error).not.toBeNull()
    await ben.client.storage.from('photos').remove([path])
    expect(read(await ana.remote.downloadPhoto(id, 'full'))).toEqual(read(jpeg(4, 5)))

    await ana.remote.removePhotos(id)
    expect(await ana.remote.downloadPhoto(id, 'full')).toBeNull()
    expect(await ana.remote.downloadPhoto(id, 'original')).toBeNull()
  })

  it('deletes an account with its journal and photos, and nobody else’s', async () => {
    const leaving = await signUp()
    const staying = await signUp()
    for (const person of [leaving, staying]) {
      const ids = [crypto.randomUUID(), crypto.randomUUID()]
      await person.remote.push(
        ids.map((id, i) => ({ id, data: cookie(id, i + 1), edited_at: i + 1, deleted: false })),
      )
      await person.remote.uploadPhoto(ids[0]!, 'full', jpeg(1))
      await person.remote.uploadPhoto(ids[0]!, 'original', jpeg(2))
      await person.remote.uploadPhoto(ids[1]!, 'full', jpeg(3))
    }
    const kept = await staying.remote.pull(null)

    await deleteAccount(leaving.client, leaving.id)

    // The account is gone: its password no longer opens anything…
    const visitor = createClient(url!, key!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const again = await visitor.auth.signInWithPassword({
      email: leaving.email,
      password: PASSWORD,
    })
    expect(again.error).not.toBeNull()
    // …and nothing of it is left behind, rows or files.
    expect(await leaving.remote.pull(null)).toEqual([])
    expect((await leaving.client.storage.from('photos').list(leaving.id)).data).toEqual([])

    // The other person never noticed.
    expect(await staying.remote.pull(null)).toEqual(kept)
    expect(read(await staying.remote.downloadPhoto(kept[0]!.id, 'full'))).not.toBeNull()
    const stillThere = await visitor.auth.signInWithPassword({
      email: staying.email,
      password: PASSWORD,
    })
    expect(stillThere.error).toBeNull()
  })

  it('only checks, and deletes nothing, until told it is meant', async () => {
    const person = await signUp()
    const id = crypto.randomUUID()
    await person.remote.push([{ id, data: cookie(id, 1), edited_at: 1, deleted: false }])
    const { data, error } = await person.client.rpc('delete_my_account', { really: false })
    expect(error).toBeNull()
    expect(data).toBe(false)
    expect((await person.remote.pull(null)).length).toBe(1)
  })

  it('will not delete an account for someone who is not signed in', async () => {
    const visitor = createClient(url!, key!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { error } = await visitor.rpc('delete_my_account', { really: true })
    expect(error).not.toBeNull()
  })

  it('syncs a journal between two devices through the real service', async () => {
    const user = await signUp()
    const phone = new CrumbsDb(`cloud-phone-${crypto.randomUUID()}`)
    const laptop = new CrumbsDb(`cloud-laptop-${crypto.randomUUID()}`)

    const id = crypto.randomUUID()
    await phone.cookies.put(cookie(id, 100, { hasPhoto: true, photoUpdatedAt: 100, cutout: true }))
    await phone.photos.put({
      cookieId: id,
      mime: 'image/jpeg',
      data: jpeg(1, 2, 3),
      width: 4,
      height: 3,
    })
    await phone.originals.put({
      cookieId: id,
      mime: 'image/jpeg',
      data: jpeg(7),
      width: 4,
      height: 3,
    })
    await noteChange(phone, id, 'put', 100, true)

    expect(await sync(phone, user.remote, tools)).toEqual({ sent: 1, received: 0 })
    expect(await sync(laptop, user.remote, tools)).toEqual({ sent: 0, received: 1 })

    expect(await laptop.cookies.get(id)).toEqual(await phone.cookies.get(id))
    expect(read((await laptop.photos.get(id))?.data)).toEqual(read(jpeg(1, 2, 3)))
    expect(read((await laptop.originals.get(id))?.data)).toEqual(read(jpeg(7)))

    // Delete on the laptop; the phone follows.
    await noteChange(laptop, id, 'delete', 200, true)
    await laptop.cookies.delete(id)
    await sync(laptop, user.remote, tools)
    await sync(phone, user.remote, tools)
    expect(await phone.cookies.get(id)).toBeUndefined()
    expect(await user.remote.downloadPhoto(id, 'full')).toBeNull()
  })
})
