import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addSampleCookies } from '@/lib/samples'
import { deleteCookie, deleteEverything, deleteSampleCookies, newId, saveCookie } from './cookies'
import type { SaveCookieInput } from './cookies'
import { db } from './db'

const input: SaveCookieInput = {
  details: {
    eatenOn: '2026-03-02',
    cookieType: 'Chocolate Chip',
    bakery: 'Flour & Salt',
    city: 'Portland',
    state: 'OR',
    price: 4.5,
    place: null,
  },
  notes: '',
  answers: {},
  suggested: { taste: 7, texture: 7, appearance: 7 },
  scores: { taste: 7, texture: 7.5, appearance: 7.5 },
  photo: 'none',
}

describe('saving cookies', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((table) => table.clear()))
  })

  it('queues a saved cookie to be synced', async () => {
    const saved = await saveCookie(input)
    expect(await db.outbox.get(saved.id)).toMatchObject({ op: 'put', photo: false })
  })

  it('queues a deleted cookie as a delete', async () => {
    const saved = await saveCookie(input)
    await deleteCookie(saved.id)
    expect(await db.cookies.count()).toBe(0)
    expect(await db.outbox.get(saved.id)).toMatchObject({ op: 'delete' })
  })

  it('adds the sample cookies in one go and keeps them off the sync queue', async () => {
    const count = await addSampleCookies()
    expect(count).toBeGreaterThan(0)
    expect(await db.cookies.count()).toBe(count)
    expect(await db.outbox.count()).toBe(0)

    expect(await deleteSampleCookies()).toBe(count)
    expect(await db.cookies.count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)
  })

  it('deleting everything queues deletes for real cookies only', async () => {
    const saved = await saveCookie(input)
    await addSampleCookies()
    await deleteEverything()
    expect(await db.cookies.count()).toBe(0)
    expect((await db.outbox.toArray()).map((entry) => [entry.id, entry.op])).toEqual([
      [saved.id, 'delete'],
    ])
  })
})

describe('a new cookie’s id', () => {
  afterEach(() => vi.unstubAllGlobals())

  const shape = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

  it('is a random UUID', () => {
    expect(newId()).toMatch(shape)
    expect(newId()).not.toBe(newId())
  })

  it('is still made on a page that isn’t secure, where randomUUID doesn’t exist', () => {
    // Plain http: the browser leaves randomUUID out but keeps getRandomValues.
    const real = globalThis.crypto
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) })
    const ids = new Set(Array.from({ length: 200 }, () => newId()))
    expect(ids.size).toBe(200)
    for (const id of ids) expect(id).toMatch(shape)
  })
})
