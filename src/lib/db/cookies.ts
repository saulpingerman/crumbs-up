import { RUBRIC_VERSION } from '@/lib/rubric'
import type { Answers, Scores } from '@/lib/rubric'
import { db } from './db'
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

  return db.transaction('rw', db.cookies, db.photos, db.thumbs, db.originals, async () => {
    const existing = input.id ? await db.cookies.get(input.id) : undefined
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
      notes: input.notes.trim(),
      answers: input.answers,
      suggested: input.suggested,
      scores: input.scores,
      rubricVersion: RUBRIC_VERSION,
      hasPhoto,
      ...(input.sample || existing?.sample ? { sample: true } : {}),
    }

    await db.cookies.put(record)

    if (input.photo === 'none') {
      await Promise.all([db.photos.delete(id), db.thumbs.delete(id), db.originals.delete(id)])
    } else if (input.photo !== 'keep') {
      await putPhoto(id, input.photo)
    }
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
    [db.cookies, db.photos, db.thumbs, db.originals, db.drafts],
    async () => {
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
    [db.cookies, db.photos, db.thumbs, db.originals, db.drafts],
    async () => {
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
