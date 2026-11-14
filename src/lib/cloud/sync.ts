/**
 * Keeps this device's journal and the cloud copy in step.
 *
 * The device's own database stays the source of truth for everything on
 * screen, so the app is exactly as fast and as usable offline as it was
 * before accounts existed. Syncing is a background exchange:
 *
 *   1. send what changed here   (the "outbox")
 *   2. fetch what changed there (everything since a remembered cursor)
 *
 * When the same cookie was edited in two places, the most recent edit wins,
 * and a deletion is just an edit that happens to remove the cookie.
 */
import type { CrumbsDb } from '@/lib/db/db'
import { cookieSchema, type CookieRecord, type PhotoImages } from '@/lib/db/schema'
import type { Remote, RemoteRow } from './remote'

/** This device's journal already belongs to a different account. */
export class DifferentAccountError extends Error {
  constructor() {
    super('This device’s journal is linked to a different account.')
  }
}

export interface SyncTools {
  /** Work out a downloaded photo's size and make its thumbnail. */
  describePhoto: (full: ArrayBuffer) => Promise<PhotoImages>
  /**
   * Told when a cookie's picture on this device changes without the cookie
   * itself changing — it arrived late, say — so screens showing it can catch up.
   */
  photoChanged?: (cookieId: string) => void
}

export interface SyncResult {
  sent: number
  received: number
}

/** Photos that failed to arrive are retried a few at a time on later syncs. */
const REPAIRS_PER_SYNC = 12

async function linkToAccount(database: CrumbsDb, remote: Remote): Promise<void> {
  const owner = (await database.meta.get('owner'))?.value
  if (owner === remote.userId) return
  if (owner) throw new DifferentAccountError()

  // First sync on this device: everything already in the journal goes up.
  await database.transaction('rw', database.cookies, database.outbox, database.meta, async () => {
    // Forget pre-account deletions; the cloud never knew those cookies.
    await database.outbox.clear()
    for (const cookie of await database.cookies.toArray()) {
      if (cookie.sample) continue
      await database.outbox.put({
        id: cookie.id,
        op: 'put',
        editedAt: cookie.updatedAt,
        photo: cookie.hasPhoto,
      })
    }
    await database.meta.delete('cursor')
    await database.meta.put({ key: 'owner', value: remote.userId })
  })
}

async function crossOff(
  database: CrumbsDb,
  entry: { id: string; op: 'put' | 'delete'; editedAt: number },
): Promise<void> {
  // Unless the cookie changed again while this was in flight.
  await database.transaction('rw', database.outbox, async () => {
    const current = await database.outbox.get(entry.id)
    if (current && current.editedAt === entry.editedAt && current.op === entry.op) {
      await database.outbox.delete(entry.id)
    }
  })
}

async function send(database: CrumbsDb, remote: Remote, tools: SyncTools): Promise<number> {
  const outbox = await database.outbox.toArray()
  if (outbox.length === 0) return 0
  // What the cloud already has for these cookies. Another device may have
  // changed one more recently than this one did.
  const theirs = new Map((await remote.current(outbox.map((e) => e.id))).map((r) => [r.id, r]))

  let sent = 0
  for (const entry of outbox) {
    const winner = theirs.get(entry.id)
    if (winner && winner.edited_at > entry.editedAt) {
      // Ours is the older edit and has lost. Sending it would be pointless
      // (the database would drop it) and worse for its photos, which have no
      // such guard: they would replace the winner's. Take the winner instead.
      await crossOff(database, entry)
      await applyRow(database, remote, tools, winner)
      continue
    }

    const cookie = entry.op === 'put' ? await database.cookies.get(entry.id) : undefined

    if (cookie && !cookie.sample) {
      // Photos go first, so a row never points at a picture that isn't there yet.
      if (entry.photo) {
        if (cookie.hasPhoto) {
          const [full, original] = await Promise.all([
            database.photos.get(cookie.id),
            database.originals.get(cookie.id),
          ])
          if (full) await remote.uploadPhoto(cookie.id, 'full', full.data)
          if (original) await remote.uploadPhoto(cookie.id, 'original', original.data)
          else await remote.removePhotos(cookie.id, ['original'])
        } else {
          await remote.removePhotos(cookie.id)
        }
      }
      await remote.push([
        { id: cookie.id, data: cookie, edited_at: cookie.updatedAt, deleted: false },
      ])
      sent += 1
    } else if (entry.op === 'delete') {
      await remote.removePhotos(entry.id)
      await remote.push([{ id: entry.id, data: {}, edited_at: entry.editedAt, deleted: true }])
      sent += 1
    }

    await crossOff(database, entry)
  }
  return sent
}

async function storePhoto(
  database: CrumbsDb,
  remote: Remote,
  tools: SyncTools,
  cookie: CookieRecord,
): Promise<boolean> {
  const bytes = await remote.downloadPhoto(cookie.id, 'full')
  if (!bytes) return false
  const [photo, original] = await Promise.all([
    tools.describePhoto(bytes),
    // Only cut-outs have an untouched original behind them.
    cookie.cutout ? remote.downloadPhoto(cookie.id, 'original') : null,
  ])
  const described = original ? await tools.describePhoto(original) : null
  await database.transaction(
    'rw',
    database.photos,
    database.thumbs,
    database.originals,
    async () => {
      await database.photos.put({
        cookieId: cookie.id,
        mime: photo.mime,
        data: photo.full,
        width: photo.width,
        height: photo.height,
      })
      await database.thumbs.put({
        cookieId: cookie.id,
        mime: photo.mime,
        data: photo.thumb,
        width: photo.thumbWidth,
        height: photo.thumbHeight,
      })
      if (described) {
        await database.originals.put({
          cookieId: cookie.id,
          mime: described.mime,
          data: described.full,
          width: described.width,
          height: described.height,
        })
      } else {
        await database.originals.delete(cookie.id)
      }
    },
  )
  return true
}

async function removeLocally(database: CrumbsDb, id: string): Promise<void> {
  const tables = [
    database.cookies,
    database.photos,
    database.thumbs,
    database.originals,
    database.outbox,
  ]
  await database.transaction('rw', tables, async () => {
    await Promise.all([
      database.cookies.delete(id),
      database.photos.delete(id),
      database.thumbs.delete(id),
      database.originals.delete(id),
      database.outbox.delete(id),
    ])
  })
}

/**
 * Bring one cookie on this device into line with the cloud's copy of it,
 * if the cloud's is the newer. @returns whether anything changed here.
 */
async function applyRow(
  database: CrumbsDb,
  remote: Remote,
  tools: SyncTools,
  row: RemoteRow,
): Promise<boolean> {
  // An edit made here that hasn't been sent yet, and is at least as new, stands.
  const pending = await database.outbox.get(row.id)
  if (pending && pending.editedAt >= row.edited_at) return false

  const local = await database.cookies.get(row.id)

  if (row.deleted) {
    if (!local || local.updatedAt > row.edited_at) return false
    await removeLocally(database, row.id)
    return true
  }
  if (local && local.updatedAt >= row.edited_at) return false

  const parsed = cookieSchema.safeParse(row.data)
  if (!parsed.success) return false // written by a newer app version, perhaps; leave it be
  const { sample: _sample, ...cookie } = parsed.data

  await database.transaction('rw', database.cookies, database.outbox, async () => {
    await database.cookies.put(cookie)
    await database.outbox.delete(cookie.id)
  })

  const dropPhoto = () =>
    Promise.all([
      database.photos.delete(cookie.id),
      database.thumbs.delete(cookie.id),
      database.originals.delete(cookie.id),
    ])
  if (!cookie.hasPhoto) {
    await dropPhoto()
  } else if (!local?.hasPhoto || local.photoUpdatedAt !== cookie.photoUpdatedAt) {
    // A new or replaced picture. If it can't be fetched right now the cookie
    // still arrives. Any picture already here is the *old* one, so it goes:
    // the cookie shows its illustration meanwhile, and having no picture is
    // what tells the repair pass to keep trying.
    const arrived = await storePhoto(database, remote, tools, cookie).catch(() => false)
    if (!arrived) await dropPhoto()
    tools.photoChanged?.(cookie.id)
  }
  return true
}

async function receive(database: CrumbsDb, remote: Remote, tools: SyncTools): Promise<number> {
  const cursor = (await database.meta.get('cursor'))?.value ?? null
  const rows = await remote.pull(cursor)
  let newest = cursor
  let received = 0

  for (const row of rows) {
    if (!newest || row.changed_at > newest) newest = row.changed_at
    if (await applyRow(database, remote, tools, row)) received += 1
  }

  if (newest && newest !== cursor) await database.meta.put({ key: 'cursor', value: newest })
  return received
}

/** Fetch pictures for cookies that say they have one but don't on this device. */
async function repairPhotos(database: CrumbsDb, remote: Remote, tools: SyncTools): Promise<void> {
  const have = new Set(await database.photos.toCollection().primaryKeys())
  const missing = (await database.cookies.toArray())
    .filter((c) => c.hasPhoto && !c.sample && !have.has(c.id))
    .slice(0, REPAIRS_PER_SYNC)
  for (const cookie of missing) {
    const arrived = await storePhoto(database, remote, tools, cookie).catch(() => false)
    if (arrived) tools.photoChanged?.(cookie.id)
  }
}

/**
 * One full exchange with the cloud. Safe to call as often as you like;
 * callers are expected to make sure only one runs at a time.
 */
export async function sync(
  database: CrumbsDb,
  remote: Remote,
  tools: SyncTools,
): Promise<SyncResult> {
  await linkToAccount(database, remote)
  const sent = await send(database, remote, tools)
  const received = await receive(database, remote, tools)
  await repairPhotos(database, remote, tools)
  await database.meta.put({ key: 'syncedAt', value: new Date().toISOString() })
  return { sent, received }
}

/**
 * Drop this device's journal and its link to an account, ready to load a
 * different account's journal. Nothing is deleted from the cloud.
 */
export async function forgetAccount(database: CrumbsDb, wipeJournal: boolean): Promise<void> {
  const tables = [
    database.cookies,
    database.photos,
    database.thumbs,
    database.originals,
    database.drafts,
    database.outbox,
    database.meta,
  ]
  await database.transaction('rw', tables, async () => {
    if (wipeJournal) {
      await Promise.all([
        database.cookies.clear(),
        database.photos.clear(),
        database.thumbs.clear(),
        database.originals.clear(),
        database.drafts.clear(),
      ])
    }
    await Promise.all([database.outbox.clear(), database.meta.clear()])
  })
}
