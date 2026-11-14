import { RUBRIC_VERSION } from '@/lib/rubric'
import type { Answers, Scores } from '@/lib/rubric'
import { db, type CrumbsDb } from './db'
import type {
  CookieDetails,
  CookieRecord,
  DraftRecord,
  ProcessedPhoto,
  StoredImage,
} from './schema'

export function newId(): string {
  return crypto.randomUUID()
}

/**
 * Note that a cookie changed on this device, so the next sync sends it.
 * Recorded whether or not anyone is signed in: it costs almost nothing, and
 * it means signing in later has an accurate list of what to send.
 */
export async function noteChange(
  database: CrumbsDb,
  id: string,
  op: 'put' | 'delete',
  editedAt: number,
  photo: boolean,
): Promise<void> {
  const pending = await database.outbox.get(id)
  await database.outbox.put({
    id,
    op,
    editedAt,
    // An earlier unsent change that touched the photo still needs sending.
    photo: photo || (op === 'put' && pending?.op === 'put' && pending.photo),
  })
}

export interface SaveCookieInput {
  /** Present when updating an existing cookie. */
  id?: string
  details: CookieDetails
  notes: string
  answers: Answers
  suggested: Scores
  scores: Scores
  /** `keep` leaves the saved photo alone, `none` removes it. */
  photo: ProcessedPhoto | 'keep' | 'none'
  sample?: boolean
  createdAt?: number
}

export async function saveCookie(input: SaveCookieInput): Promise<CookieRecord> {
  const now = Date.now()
  const id = input.id ?? newId()

  const tables = [db.cookies, db.photos, db.thumbs, db.originals, db.outbox]
  return db.transaction('rw', tables, async () => {
    const existing = input.id ? await db.cookies.get(input.id) : undefined
    const photoChanged =
      input.photo !== 'keep' && (input.photo !== 'none' || Boolean(existing?.hasPhoto))
    const cutout =
      input.photo === 'keep'
        ? Boolean(existing?.cutout)
        : input.photo !== 'none' && Boolean(input.photo.original)
    const hasPhoto = input.photo === 'keep' ? (existing?.hasPhoto ?? false) : input.photo !== 'none'

    const record: CookieRecord = {
      id,
      createdAt: existing?.createdAt ?? input.createdAt ?? now,
      updatedAt: now,
      eatenOn: input.details.eatenOn,
      cookieType: input.details.cookieType.trim(),
      bakery: input.details.bakery.trim(),
      city: input.details.city.trim(),
      state: input.details.state,
      price: input.details.price,
      place: input.details.place,
      notes: input.notes.trim(),
      answers: input.answers,
      suggested: input.suggested,
      scores: input.scores,
      rubricVersion: RUBRIC_VERSION,
      hasPhoto,
      ...(cutout ? { cutout: true } : {}),
      ...(photoChanged
        ? { photoUpdatedAt: now }
        : existing?.photoUpdatedAt !== undefined
          ? { photoUpdatedAt: existing.photoUpdatedAt }
          : {}),
      ...(input.sample || existing?.sample ? { sample: true } : {}),
    }

    await db.cookies.put(record)

    if (input.photo === 'none') {
      await Promise.all([db.photos.delete(id), db.thumbs.delete(id), db.originals.delete(id)])
    } else if (input.photo !== 'keep') {
      await putPhoto(id, input.photo)
    }
    // Sample cookies are for looking around; they never leave the device.
    if (!record.sample) await noteChange(db, id, 'put', now, photoChanged)
    return record
  })
}

export async function putPhoto(cookieId: string, photo: ProcessedPhoto): Promise<void> {
  const full: StoredImage = {
    cookieId,
    mime: photo.mime,
    data: photo.full,
    width: photo.width,
    height: photo.height,
  }
  const thumb: StoredImage = {
    cookieId,
    mime: photo.mime,
    data: photo.thumb,
    width: photo.thumbWidth,
    height: photo.thumbHeight,
  }
  await Promise.all([
    db.photos.put(full),
    db.thumbs.put(thumb),
    photo.original
      ? db.originals.put({
          cookieId,
          mime: photo.original.mime,
          data: photo.original.full,
          width: photo.original.width,
          height: photo.original.height,
        })
      : db.originals.delete(cookieId),
  ])
}

/**
 * Rebuild the in-memory form of a saved photo — including the original
 * behind a cut-out — for the photo editor.
 */
export async function loadPhoto(cookieId: string): Promise<ProcessedPhoto | null> {
  const [full, thumb, original] = await Promise.all([
    db.photos.get(cookieId),
    db.thumbs.get(cookieId),
    db.originals.get(cookieId),
  ])
  if (!full || !thumb) return null
  return {
    mime: full.mime,
    full: full.data,
    thumb: thumb.data,
    width: full.width,
    height: full.height,
    thumbWidth: thumb.width,
    thumbHeight: thumb.height,
    ...(original
      ? {
          original: {
            mime: original.mime,
            full: original.data,
            // Not stored; nothing reads an original's thumbnail before it is re-made.
            thumb: thumb.data,
            width: original.width,
            height: original.height,
            thumbWidth: thumb.width,
            thumbHeight: thumb.height,
          },
        }
      : {}),
  }
}

export async function deleteCookie(id: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.cookies, db.photos, db.thumbs, db.originals, db.drafts, db.outbox],
    async () => {
      const existing = await db.cookies.get(id)
      if (existing && !existing.sample) await noteChange(db, id, 'delete', Date.now(), true)
      await Promise.all([
        db.cookies.delete(id),
        db.photos.delete(id),
        db.thumbs.delete(id),
        db.originals.delete(id),
        db.drafts.delete(`edit:${id}`),
      ])
    },
  )
}

export async function deleteSampleCookies(): Promise<number> {
  const samples = await db.cookies.filter((c) => c.sample === true).primaryKeys()
  await db.transaction('rw', db.cookies, db.photos, db.thumbs, db.originals, async () => {
    await Promise.all([
      db.cookies.bulkDelete(samples),
      db.photos.bulkDelete(samples),
      db.thumbs.bulkDelete(samples),
      db.originals.bulkDelete(samples),
    ])
  })
  return samples.length
}

export async function deleteEverything(): Promise<void> {
  await db.transaction(
    'rw',
    [db.cookies, db.photos, db.thumbs, db.originals, db.drafts, db.outbox],
    async () => {
      // Deleting the journal deletes it everywhere it is synced to.
      const now = Date.now()
      for (const cookie of await db.cookies.toArray()) {
        if (!cookie.sample) await noteChange(db, cookie.id, 'delete', now, true)
      }
      await Promise.all([
        db.cookies.clear(),
        db.photos.clear(),
        db.thumbs.clear(),
        db.originals.clear(),
        db.drafts.clear(),
      ])
    },
  )
}

/* -------------------------------- Drafts -------------------------------- */

export function draftKey(editId?: string | null): string {
  return editId ? `edit:${editId}` : 'new'
}

export async function loadDraft(key: string): Promise<DraftRecord | undefined> {
  return db.drafts.get(key)
}

export async function saveDraft(draft: DraftRecord): Promise<void> {
  await db.drafts.put(draft)
}

export async function clearDraft(key: string): Promise<void> {
  await db.drafts.delete(key)
}
