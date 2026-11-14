import { beforeEach, describe, expect, it } from 'vitest'
import { addSampleCookies } from '@/lib/samples'
import { deleteCookie, deleteEverything, deleteSampleCookies, saveCookie } from './cookies'
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
