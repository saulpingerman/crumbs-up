import { beforeEach, describe, expect, it } from 'vitest'
import { CrumbsDb } from '@/lib/db/db'
import { addWantToGo, removeWantToGo } from './want-to-go'

const place = {
  id: 'N4242',
  name: 'Rise & Shine Cookie Co.',
  street: '12 Northwest Flanders Street',
  city: 'Portland',
  state: 'OR',
  lat: 45.5262,
  lng: -122.6712,
}

describe('want to go', () => {
  let database: CrumbsDb
  beforeEach(async () => {
    database = new CrumbsDb(`want-to-go-${crypto.randomUUID()}`)
    await database.open()
  })

  it('keeps just what is needed to find a place and rate it', async () => {
    await addWantToGo({ ...place, kind: 'bakery' } as typeof place, database, 1000)
    expect(await database.wantToGo.toArray()).toEqual([{ ...place, addedAt: 1000 }])
  })

  it('saves a place once, however often it is tapped, and lets it go again', async () => {
    await addWantToGo(place, database, 1000)
    await addWantToGo(place, database, 2000)
    expect(await database.wantToGo.count()).toBe(1)
    await removeWantToGo(place.id, database)
    expect(await database.wantToGo.count()).toBe(0)
  })

  it('lists the newest first', async () => {
    await addWantToGo(place, database, 1000)
    await addWantToGo({ ...place, id: 'N1', name: 'Later Bakery' }, database, 2000)
    const newestFirst = await database.wantToGo.orderBy('addedAt').reverse().toArray()
    expect(newestFirst.map((p) => p.name)).toEqual(['Later Bakery', 'Rise & Shine Cookie Co.'])
  })
})
