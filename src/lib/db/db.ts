import Dexie, { type EntityTable, type Table } from 'dexie'
import type { CookieRecord, DraftRecord, StoredImage } from './schema'

/**
 * Everything lives on the device in IndexedDB. Photos sit in their own
 * tables so listing cookies never pulls image bytes into memory, and
 * thumbnails are split from originals so the journal grid stays light.
 */
export class CrumbsDb extends Dexie {
  cookies!: EntityTable<CookieRecord, 'id'>
  photos!: Table<StoredImage, string>
  thumbs!: Table<StoredImage, string>
  drafts!: EntityTable<DraftRecord, 'key'>

  constructor(name = 'crumbs-up') {
    super(name)
    this.version(1).stores({
      cookies: 'id, eatenOn, updatedAt, state, bakery, cookieType',
      photos: 'cookieId',
      thumbs: 'cookieId',
      drafts: 'key',
    })
  }
}

export const db = new CrumbsDb()

/**
 * Ask the browser not to evict our data under storage pressure. Browsers
 * decide silently (Chrome, Safari) or by asking (Firefox); either way it is
 * best-effort, which is why backups exist.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}
