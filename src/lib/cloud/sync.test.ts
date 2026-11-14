import { beforeEach, describe, expect, it } from 'vitest'
import { exportBackup, importBackup } from '@/lib/db/backup'
import { noteChange } from '@/lib/db/cookies'
import { CrumbsDb } from '@/lib/db/db'
import type { CookieRecord, PhotoImages } from '@/lib/db/schema'
import type { PhotoName, PushRow, Remote, RemoteRow } from './remote'
import { WEIGHT_PRESETS } from '@/lib/rubric'
import { DifferentAccountError, forgetAccount, sync, type SyncTools } from './sync'

/* ------------------------- An in-memory stand-in cloud ------------------------- */

class FakeCloud {
  rows = new Map<string, RemoteRow & { owner: string }>()
  photos = new Map<string, ArrayBuffer>()
  private tick = 0
  /** Set to make photo downloads fail, as if the connection dropped. */
  offlineForPhotos = false

  private stamp(): string {
    this.tick += 1
    return new Date(Date.UTC(2026, 0, 1) + this.tick * 1000).toISOString()
  }

  as(userId: string): Remote {
    const key = (cookieId: string, name: PhotoName) => `${userId}/${cookieId}/${name}`
    return {
      userId,
      pull: async (cursor) =>
        [...this.rows.values()]
          .filter((row) => row.owner === userId && (!cursor || row.changed_at > cursor))
          .sort((a, b) => a.changed_at.localeCompare(b.changed_at))
          .map(({ owner: _owner, ...row }) => structuredClone(row)),
      current: async (ids) =>
        [...this.rows.values()]
          .filter((row) => row.owner === userId && ids.includes(row.id))
          .map(({ owner: _owner, ...row }) => structuredClone(row)),
      push: async (rows: PushRow[]) => {
        for (const row of rows) {
          // Ids are unique per person, as in the real table.
          const existing = this.rows.get(`${userId}/${row.id}`)
          // The database's rule: an older edit arriving late is ignored.
          if (existing && row.edited_at < existing.edited_at) continue
          this.rows.set(`${userId}/${row.id}`, {
            ...structuredClone(row),
            owner: userId,
            changed_at: this.stamp(),
          })
        }
      },
      uploadPhoto: async (cookieId, name, bytes) => {
        this.photos.set(key(cookieId, name), bytes.slice(0))
      },
      downloadPhoto: async (cookieId, name) => {
        if (this.offlineForPhotos) throw new Error('offline')
        return this.photos.get(key(cookieId, name))?.slice(0) ?? null
      },
      removePhotos: async (cookieId, names = ['full', 'original']) => {
        for (const name of names) this.photos.delete(key(cookieId, name))
      },
    }
  }
}

/** No canvas in tests: a "thumbnail" is just the first byte. */
const tools: SyncTools = {
  describePhoto: async (full): Promise<PhotoImages> => ({
    mime: 'image/jpeg',
    full,
    thumb: full.slice(0, 1),
    width: 4,
    height: 3,
    thumbWidth: 2,
    thumbHeight: 1,
  }),
}

/* --------------------------------- Devices --------------------------------- */

let serial = 0
function device(): CrumbsDb {
  return new CrumbsDb(`sync-test-${++serial}`)
}

const bytes = (...values: number[]) => new Uint8Array(values).buffer
const read = (buffer: ArrayBuffer | undefined) => (buffer ? [...new Uint8Array(buffer)] : null)

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
    price: null,
    place: null,
    notes: '',
    answers: {},
    suggested: { taste: 7, texture: 7, appearance: 7 },
    scores: { taste: 7, texture: 7, appearance: 7 },
    rubricVersion: 1,
    hasPhoto: false,
    ...patch,
  }
}

/** What saving a cookie in the app does to a device's database. */
async function rate(
  db: CrumbsDb,
  record: CookieRecord,
  photo?: { full: ArrayBuffer; original?: ArrayBuffer },
) {
  const withPhoto = photo
    ? {
        ...record,
        hasPhoto: true,
        photoUpdatedAt: record.updatedAt,
        ...(photo.original ? { cutout: true } : {}),
      }
    : record
  await db.cookies.put(withPhoto)
  if (photo) {
    await db.photos.put({
      cookieId: record.id,
      mime: 'image/jpeg',
      data: photo.full,
      width: 4,
      height: 3,
    })
    await db.thumbs.put({
      cookieId: record.id,
      mime: 'image/jpeg',
      data: photo.full.slice(0, 1),
      width: 2,
      height: 1,
    })
    if (photo.original) {
      await db.originals.put({
        cookieId: record.id,
        mime: 'image/jpeg',
        data: photo.original,
        width: 4,
        height: 3,
      })
    }
  }
  if (!record.sample) await noteChange(db, record.id, 'put', record.updatedAt, Boolean(photo))
}

async function remove(db: CrumbsDb, id: string, at: number) {
  await noteChange(db, id, 'delete', at, true)
  await Promise.all([
    db.cookies.delete(id),
    db.photos.delete(id),
    db.thumbs.delete(id),
    db.originals.delete(id),
  ])
}

/* ---------------------------------- Tests ---------------------------------- */

describe('sync', () => {
  let cloud: FakeCloud
  let phone: CrumbsDb
  let laptop: CrumbsDb

  beforeEach(() => {
    cloud = new FakeCloud()
    phone = device()
    laptop = device()
  })

  const syncPhone = () => sync(phone, cloud.as('ana'), tools)
  const syncLaptop = () => sync(laptop, cloud.as('ana'), tools)

  it('sends an existing journal up on first sign-in, but never the samples', async () => {
    await rate(phone, cookie('a', 10), { full: bytes(1, 2, 3), original: bytes(9, 9) })
    await rate(phone, cookie('b', 11))
    await rate(phone, cookie('s', 12, { sample: true }))

    expect(await syncPhone()).toEqual({ sent: 2, received: 0 })
    expect([...cloud.rows.keys()].sort()).toEqual(['ana/a', 'ana/b'])
    expect(read(cloud.photos.get('ana/a/full'))).toEqual([1, 2, 3])
    expect(read(cloud.photos.get('ana/a/original'))).toEqual([9, 9])
    expect(await phone.outbox.count()).toBe(0)

    // Nothing left to do the second time.
    expect(await syncPhone()).toEqual({ sent: 0, received: 0 })
  })

  it('brings the journal, photos included, to a second device', async () => {
    await rate(phone, cookie('a', 10, { notes: 'still warm' }), {
      full: bytes(1, 2, 3),
      original: bytes(9),
    })
    await syncPhone()

    expect(await syncLaptop()).toEqual({ sent: 0, received: 1 })
    expect(await laptop.cookies.get('a')).toMatchObject({ notes: 'still warm', hasPhoto: true })
    expect(read((await laptop.photos.get('a'))?.data)).toEqual([1, 2, 3])
    expect(read((await laptop.thumbs.get('a'))?.data)).toEqual([1])
    expect(read((await laptop.originals.get('a'))?.data)).toEqual([9])
    // Receiving a cookie is not a change to send back.
    expect(await laptop.outbox.count()).toBe(0)
  })

  it('carries edits both ways', async () => {
    await rate(phone, cookie('a', 10))
    await syncPhone()
    await syncLaptop()

    await rate(laptop, cookie('a', 20, { notes: 'edited on the laptop' }))
    await rate(laptop, cookie('b', 21))
    await syncLaptop()
    await syncPhone()

    expect((await phone.cookies.get('a'))?.notes).toBe('edited on the laptop')
    expect(await phone.cookies.count()).toBe(2)
  })

  it('keeps the most recent edit when both devices changed the same cookie', async () => {
    await rate(phone, cookie('a', 10))
    await syncPhone()
    await syncLaptop()

    // Both go offline and edit; the laptop's edit is the later one.
    await rate(phone, cookie('a', 30, { notes: 'phone, earlier' }))
    await rate(laptop, cookie('a', 40, { notes: 'laptop, later' }))

    // Whichever order they come back online in, the later edit wins everywhere.
    await syncLaptop()
    await syncPhone()
    await syncLaptop()
    expect((await phone.cookies.get('a'))?.notes).toBe('laptop, later')
    expect((await laptop.cookies.get('a'))?.notes).toBe('laptop, later')
    expect(cloud.rows.get('ana/a')?.edited_at).toBe(40)

    // And the other way round.
    await rate(phone, cookie('a', 60, { notes: 'phone, later' }))
    await rate(laptop, cookie('a', 50, { notes: 'laptop, earlier' }))
    await syncPhone()
    await syncLaptop()
    await syncPhone()
    expect((await laptop.cookies.get('a'))?.notes).toBe('phone, later')
    expect((await phone.cookies.get('a'))?.notes).toBe('phone, later')
  })

  it('does not let an incoming older copy overwrite an unsent edit', async () => {
    await rate(phone, cookie('a', 10))
    await syncPhone()
    await syncLaptop()
    await rate(laptop, cookie('a', 20, { notes: 'on the laptop' }))
    await syncLaptop()

    // The phone has a newer edit it hasn't sent; make it receive first.
    await rate(phone, cookie('a', 30, { notes: 'on the phone, newer' }))
    const remote = cloud.as('ana')
    const receiveOnly: Remote = {
      ...remote,
      push: async () => {},
      uploadPhoto: async () => {},
      removePhotos: async () => {},
    }
    await sync(phone, receiveOnly, tools)
    expect((await phone.cookies.get('a'))?.notes).toBe('on the phone, newer')
  })

  it('deletes everywhere, and a deletion does not come back', async () => {
    await rate(phone, cookie('a', 10), { full: bytes(1) })
    await syncPhone()
    await syncLaptop()

    await remove(phone, 'a', 20)
    await syncPhone()
    expect(cloud.rows.get('ana/a')?.deleted).toBe(true)
    expect(cloud.photos.size).toBe(0)

    expect(await syncLaptop()).toEqual({ sent: 0, received: 1 })
    expect(await laptop.cookies.get('a')).toBeUndefined()
    expect(await laptop.photos.get('a')).toBeUndefined()

    // A brand-new device never sees it at all.
    const tablet = device()
    await sync(tablet, cloud.as('ana'), tools)
    expect(await tablet.cookies.count()).toBe(0)
  })

  it('lets a later edit win over an earlier deletion', async () => {
    await rate(phone, cookie('a', 10))
    await syncPhone()
    await syncLaptop()

    await remove(phone, 'a', 20)
    await rate(laptop, cookie('a', 30, { notes: 'rescued' }))
    await syncPhone()
    await syncLaptop()
    await syncPhone()
    expect((await phone.cookies.get('a'))?.notes).toBe('rescued')
    expect(cloud.rows.get('ana/a')?.deleted).toBe(false)
  })

  it('replaces and removes photos on the other device', async () => {
    await rate(phone, cookie('a', 10), { full: bytes(1), original: bytes(7) })
    await syncPhone()
    await syncLaptop()

    // A new picture, no longer a cut-out.
    await rate(phone, cookie('a', 20), { full: bytes(2) })
    await phone.originals.delete('a')
    await syncPhone()
    await syncLaptop()
    expect(read((await laptop.photos.get('a'))?.data)).toEqual([2])
    expect(await laptop.originals.get('a')).toBeUndefined()

    // Then no picture at all.
    await phone.cookies.put(cookie('a', 30, { hasPhoto: false, photoUpdatedAt: 30 }))
    await Promise.all([phone.photos.delete('a'), phone.thumbs.delete('a')])
    await noteChange(phone, 'a', 'put', 30, true)
    await syncPhone()
    await syncLaptop()
    expect((await laptop.cookies.get('a'))?.hasPhoto).toBe(false)
    expect(await laptop.photos.get('a')).toBeUndefined()
    expect(cloud.photos.size).toBe(0)
  })

  it('fetches a photo later if it could not be downloaded the first time', async () => {
    await rate(phone, cookie('a', 10), { full: bytes(5, 6) })
    await syncPhone()

    cloud.offlineForPhotos = true
    await syncLaptop()
    expect(await laptop.cookies.get('a')).toMatchObject({ hasPhoto: true })
    expect(await laptop.photos.get('a')).toBeUndefined()

    cloud.offlineForPhotos = false
    await syncLaptop()
    expect(read((await laptop.photos.get('a'))?.data)).toEqual([5, 6])
  })

  it('does not let a losing edit’s photo replace the winner’s', async () => {
    await rate(phone, cookie('a', 10), { full: bytes(1) })
    await syncPhone()
    await syncLaptop()

    // The phone, offline, swaps the photo. Later the laptop does too, and syncs first.
    await rate(phone, cookie('a', 20), { full: bytes(2) })
    await rate(laptop, cookie('a', 30, { notes: 'the keeper' }), { full: bytes(3) })
    await syncLaptop()

    await syncPhone()
    // The cloud still has the laptop's picture, and the phone has caught up with it.
    expect(read(cloud.photos.get('ana/a/full'))).toEqual([3])
    expect((await phone.cookies.get('a'))?.notes).toBe('the keeper')
    expect(read((await phone.photos.get('a'))?.data)).toEqual([3])
    expect(await phone.outbox.count()).toBe(0)
  })

  it('does not let a stale deletion remove the photo of a cookie edited since', async () => {
    await rate(phone, cookie('a', 10), { full: bytes(1) })
    await syncPhone()
    await syncLaptop()

    await remove(phone, 'a', 20) // offline
    await rate(laptop, cookie('a', 30), { full: bytes(3) })
    await syncLaptop()

    await syncPhone()
    expect(read(cloud.photos.get('ana/a/full'))).toEqual([3])
    expect(read((await phone.photos.get('a'))?.data)).toEqual([3])
    await syncLaptop()
    expect(await laptop.cookies.get('a')).toBeDefined()
  })

  it('never shows the old photo as the new one when the new one fails to arrive', async () => {
    await rate(phone, cookie('a', 10), { full: bytes(1) })
    await syncPhone()
    await syncLaptop()

    await rate(phone, cookie('a', 20), { full: bytes(2) })
    await syncPhone()

    cloud.offlineForPhotos = true
    await syncLaptop()
    // Better no picture (the app draws one) than the wrong picture…
    expect((await laptop.cookies.get('a'))?.photoUpdatedAt).toBe(20)
    expect(await laptop.photos.get('a')).toBeUndefined()

    // …and having none is what gets it fetched once the connection is back.
    cloud.offlineForPhotos = false
    const changed: string[] = []
    await sync(laptop, cloud.as('ana'), { ...tools, photoChanged: (id) => changed.push(id) })
    expect(read((await laptop.photos.get('a'))?.data)).toEqual([2])
    expect(changed).toEqual(['a'])
  })

  it('brings cookies back from a backup after they were deleted everywhere', async () => {
    const weights = WEIGHT_PRESETS.equal.weights
    await rate(phone, cookie('a', 10), { full: bytes(1) })
    await rate(phone, cookie('b', 11))
    await syncPhone()
    await syncLaptop()
    const backup = await exportBackup({ weights, precision: 'half', skipSamples: true }, phone)

    await remove(phone, 'a', 50)
    await remove(phone, 'b', 50)
    await syncPhone()
    await syncLaptop()
    expect(await laptop.cookies.count()).toBe(0)

    // Restoring is a new decision: it must outrank the deletions on record.
    const result = await importBackup(backup.blob, phone)
    expect(result.added).toBe(2)
    await syncPhone()
    await syncLaptop()
    expect((await laptop.cookies.toArray()).map((c) => c.id).sort()).toEqual(['a', 'b'])
    expect(read((await laptop.photos.get('a'))?.data)).toEqual([1])
    // And they stay, on the phone as well, however many times it syncs.
    await syncPhone()
    expect(await phone.cookies.count()).toBe(2)
  })

  it('keeps a change that was made while a sync was in flight', async () => {
    await rate(phone, cookie('a', 10))
    const remote = cloud.as('ana')
    const slow: Remote = {
      ...remote,
      push: async (rows) => {
        await remote.push(rows)
        // The person edits the cookie again before the sync finishes.
        if (rows[0]?.edited_at === 10)
          await rate(phone, cookie('a', 15, { notes: 'edited mid-sync' }))
      },
    }
    await sync(phone, slow, tools)
    expect(await phone.outbox.get('a')).toMatchObject({ editedAt: 15 })
    await syncPhone()
    expect(cloud.rows.get('ana/a')?.data).toMatchObject({ notes: 'edited mid-sync' })
  })

  it('ignores rows it cannot read rather than failing', async () => {
    await cloud
      .as('ana')
      .push([{ id: 'x', data: { nonsense: true }, edited_at: 5, deleted: false }])
    expect(await syncPhone()).toEqual({ sent: 0, received: 0 })
    expect(await phone.cookies.count()).toBe(0)
  })

  it('keeps each account’s journal to itself', async () => {
    await rate(phone, cookie('a', 10))
    await syncPhone()

    const stranger = device()
    await sync(stranger, cloud.as('ben'), tools)
    expect(await stranger.cookies.count()).toBe(0)
  })

  it('refuses to mix one account’s device journal into another account', async () => {
    await rate(phone, cookie('a', 10))
    await syncPhone()
    await expect(sync(phone, cloud.as('ben'), tools)).rejects.toBeInstanceOf(DifferentAccountError)
    expect(cloud.rows.get('ana/a')?.owner).toBe('ana')

    // Choosing to switch: clear this device, then load the other account.
    await rate(device(), cookie('unused', 1))
    const bens = device()
    await rate(bens, cookie('b', 10, { bakery: 'Ben’s find' }))
    await sync(bens, cloud.as('ben'), tools)

    await forgetAccount(phone, true)
    expect(await sync(phone, cloud.as('ben'), tools)).toEqual({ sent: 0, received: 1 })
    expect((await phone.cookies.toArray()).map((c) => c.bakery)).toEqual(['Ben’s find'])
    // Ana's journal is untouched in the cloud.
    expect(cloud.rows.get('ana/a')).toMatchObject({ owner: 'ana', deleted: false })
  })

  it('can add a device’s journal to a different account on purpose', async () => {
    await rate(phone, cookie('a', 10, { notes: 'from the old account' }), { full: bytes(1) })
    await syncPhone()

    // Unlink but keep the journal, then sync as someone else: everything goes up again.
    await forgetAccount(phone, false)
    expect(await sync(phone, cloud.as('ben'), tools)).toEqual({ sent: 1, received: 0 })
    expect(cloud.rows.get('ben/a')?.data).toMatchObject({ notes: 'from the old account' })
    expect(read(cloud.photos.get('ben/a/full'))).toEqual([1])
    // The old account still has its own copy.
    expect(cloud.rows.get('ana/a')).toMatchObject({ owner: 'ana', deleted: false })
  })

  it('can sign out and keep the journal on the device, then sign back in', async () => {
    await rate(phone, cookie('a', 10))
    await syncPhone()
    await forgetAccount(phone, false)
    expect(await phone.cookies.count()).toBe(1)

    // Signing back in re-links and re-sends; nothing is duplicated.
    expect(await syncPhone()).toEqual({ sent: 1, received: 0 })
    expect([...cloud.rows.keys()]).toEqual(['ana/a'])
  })
})
