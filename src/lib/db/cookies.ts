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

  return db.transaction('rw', db.cookies, db.photos, db.thumbs, async () => {
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
      await Promise.all([db.photos.delete(id), db.thumbs.delete(id)])
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
  await Promise.all([db.photos.put(full), db.thumbs.put(thumb)])
}

export async function deleteCookie(id: string): Promise<void> {
  await db.transaction('rw', db.cookies, db.photos, db.thumbs, db.drafts, async () => {
    await Promise.all([
      db.cookies.delete(id),
      db.photos.delete(id),
      db.thumbs.delete(id),
      db.drafts.delete(`edit:${id}`),
    ])
  })
}

export async function deleteSampleCookies(): Promise<number> {
  const samples = await db.cookies.filter((c) => c.sample === true).primaryKeys()
  await db.transaction('rw', db.cookies, db.photos, db.thumbs, async () => {
    await Promise.all([
      db.cookies.bulkDelete(samples),
      db.photos.bulkDelete(samples),
      db.thumbs.bulkDelete(samples),
    ])
  })
  return samples.length
}

export async function deleteEverything(): Promise<void> {
  await db.transaction('rw', db.cookies, db.photos, db.thumbs, db.drafts, async () => {
    await Promise.all([db.cookies.clear(), db.photos.clear(), db.thumbs.clear(), db.drafts.clear()])
  })
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
