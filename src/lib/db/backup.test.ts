import { beforeEach, describe, expect, it } from 'vitest'
import { WEIGHT_PRESETS } from '@/lib/rubric'
import { exportBackup, importBackup, toCsv } from './backup'
import { CrumbsDb } from './db'
import type { CookieRecord } from './schema'

const weights = WEIGHT_PRESETS.equal.weights

function cookie(patch: Partial<CookieRecord> = {}): CookieRecord {
  return {
    id: 'a',
    createdAt: 1,
    updatedAt: 1,
    eatenOn: '2026-03-02',
    cookieType: 'Chocolate Chip',
    bakery: 'Flour & Salt',
    city: 'Portland',
    state: 'OR',
    price: 4.5,
    notes: 'Crisp edges, "molten" middle',
    answers: { 'taste.depth': 'taste.depth.5', 'taste.flaws': ['taste.flaw.salty'] },
    suggested: { taste: 8, texture: 7, appearance: 6.5 },
    scores: { taste: 8.5, texture: 7, appearance: 6.5 },
    rubricVersion: 1,
    hasPhoto: false,
    ...patch,
  }
}

function bytes(...values: number[]): ArrayBuffer {
  return new Uint8Array(values).buffer
}

let n = 0
function freshDb(): CrumbsDb {
  return new CrumbsDb(`test-${++n}`)
}

describe('backup', () => {
  let source: CrumbsDb
  let target: CrumbsDb

  beforeEach(() => {
    source = freshDb()
    target = freshDb()
  })

  it('round-trips cookies and photos between devices', async () => {
    await source.cookies.bulkPut([cookie({ hasPhoto: true }), cookie({ id: 'b', state: 'WA' })])
    await source.photos.put({
      cookieId: 'a',
      mime: 'image/jpeg',
      data: bytes(1, 2, 3),
      width: 4,
      height: 3,
    })
    await source.thumbs.put({
      cookieId: 'a',
      mime: 'image/jpeg',
      data: bytes(9),
      width: 2,
      height: 1,
    })

    const { blob, count, filename } = await exportBackup({ weights, precision: 'half' }, source)
    expect(count).toBe(2)
    expect(filename).toMatch(/^crumbs-up-backup-\d{4}-\d{2}-\d{2}\.zip$/)

    const result = await importBackup(blob, target)
    expect(result).toEqual({ added: 2, updated: 0, unchanged: 0, skipped: 0 })

    expect(await target.cookies.get('a')).toEqual(cookie({ hasPhoto: true }))
    expect((await target.cookies.get('b'))?.hasPhoto).toBe(false)
    const photo = await target.photos.get('a')
    expect([...new Uint8Array(photo!.data)]).toEqual([1, 2, 3])
    expect(photo).toMatchObject({ width: 4, height: 3, mime: 'image/jpeg' })
    expect([...new Uint8Array((await target.thumbs.get('a'))!.data)]).toEqual([9])
  })

  it('keeps whichever copy was edited most recently', async () => {
    await source.cookies.put(cookie({ updatedAt: 5, notes: 'from the backup' }))
    const { blob } = await exportBackup({ weights, precision: 'half' }, source)

    await target.cookies.put(cookie({ updatedAt: 9, notes: 'newer on this device' }))
    expect(await importBackup(blob, target)).toMatchObject({ unchanged: 1, updated: 0 })
    expect((await target.cookies.get('a'))?.notes).toBe('newer on this device')

    await target.cookies.put(cookie({ updatedAt: 2, notes: 'older on this device' }))
    expect(await importBackup(blob, target)).toMatchObject({ updated: 1 })
    expect((await target.cookies.get('a'))?.notes).toBe('from the backup')
  })

  it('is harmless to import twice', async () => {
    await source.cookies.put(cookie())
    const { blob } = await exportBackup({ weights, precision: 'half' }, source)
    await importBackup(blob, target)
    expect(await importBackup(blob, target)).toEqual({
      added: 0,
      updated: 0,
      unchanged: 1,
      skipped: 0,
    })
    expect(await target.cookies.count()).toBe(1)
  })

  it('can leave the sample cookies out', async () => {
    await source.cookies.bulkPut([cookie(), cookie({ id: 's', sample: true })])
    const { count } = await exportBackup({ weights, precision: 'half', skipSamples: true }, source)
    expect(count).toBe(1)
  })

  it('rejects files that are not backups', async () => {
    await expect(importBackup(new Blob(['hello']), target)).rejects.toThrow(
      /isn’t a Crumbs Up backup/,
    )
  })
})

describe('toCsv', () => {
  it('writes one row per cookie and escapes awkward text', () => {
    const csv = toCsv([cookie()], weights, 'half')
    const [header, row] = csv.split('\r\n')
    expect(header).toBe(
      'Date,Cookie,Bakery,City,State,Taste,Texture,Appearance,Overall,Price,Notes',
    )
    expect(row).toBe(
      '2026-03-02,Chocolate Chip,Flour & Salt,Portland,Oregon,8.5,7,6.5,7.5,4.5,"Crisp edges, ""molten"" middle"',
    )
  })
})
