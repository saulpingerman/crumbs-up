/**
 * What the sync engine needs from "the cloud", and nothing more. Keeping it
 * this small means the engine can be tested against an in-memory fake, and
 * the Supabase-specific code stays in one place.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface RemoteRow {
  id: string
  /** The cookie as stored on a device, or `{}` for a deletion marker. */
  data: unknown
  /** Edit time by the editing device's clock, ms since 1970. Newest wins. */
  edited_at: number
  deleted: boolean
  /** Server time of the last change; the "anything new since…?" cursor. */
  changed_at: string
}

export type PushRow = Omit<RemoteRow, 'changed_at'>

/** `full` is the picture shown; `original` is the untouched photo behind a cut-out. */
export type PhotoName = 'full' | 'original'

export interface Remote {
  /** The signed-in person. Their id is the folder their photos live under. */
  readonly userId: string
  /** Rows changed since `cursor` (all of them when it is null), oldest change first. */
  pull(cursor: string | null): Promise<RemoteRow[]>
  /** What the cloud holds right now for these cookies; ones it has never seen are left out. */
  current(ids: string[]): Promise<RemoteRow[]>
  push(rows: PushRow[]): Promise<void>
  uploadPhoto(cookieId: string, name: PhotoName, bytes: ArrayBuffer): Promise<void>
  /** `null` when there is no such photo. */
  downloadPhoto(cookieId: string, name: PhotoName): Promise<ArrayBuffer | null>
  removePhotos(cookieId: string, names?: PhotoName[]): Promise<void>
}

const BUCKET = 'photos'
const PAGE = 500
/**
 * Rows are re-read from slightly before the cursor. Two devices writing at
 * the same moment can commit in the opposite order to their timestamps, and
 * applying a row twice is harmless, so overlapping is the safe side to err on.
 */
const OVERLAP_MS = 30_000

export class SupabaseRemote implements Remote {
  readonly userId: string
  private readonly client: SupabaseClient

  constructor(client: SupabaseClient, userId: string) {
    this.client = client
    this.userId = userId
  }

  private path(cookieId: string, name: PhotoName): string {
    return `${this.userId}/${cookieId}/${name}.jpg`
  }

  async pull(cursor: string | null): Promise<RemoteRow[]> {
    const since = cursor ? new Date(new Date(cursor).getTime() - OVERLAP_MS).toISOString() : null
    const rows: RemoteRow[] = []
    const seen = new Set<string>()
    // Each page starts where the last one ended, rather than "skip the first
    // N rows": a row edited while this is under way moves to the end of the
    // list, and counting from the top would then step over one of the others.
    let from = since
    for (;;) {
      let query = this.client
        .from('cookies')
        .select('id, data, edited_at, deleted, changed_at')
        .order('changed_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(PAGE)
      // The first page is strictly after the cursor; later ones re-read the
      // row they left off at, in case others share its timestamp.
      if (from)
        query = from === since ? query.gt('changed_at', from) : query.gte('changed_at', from)
      const { data, error } = await query
      if (error) throw new Error(`Could not read the cloud journal: ${error.message}`)
      const page = data as RemoteRow[]
      let fresh = 0
      for (const row of page) {
        const key = `${row.id}@${row.changed_at}`
        if (seen.has(key)) continue
        seen.add(key)
        rows.push(row)
        fresh += 1
      }
      const last = page[page.length - 1]
      // Done when the page wasn't full, or (so this can't loop) brought nothing new.
      if (page.length < PAGE || fresh === 0 || !last) return rows
      from = last.changed_at
    }
  }

  async current(ids: string[]): Promise<RemoteRow[]> {
    const rows: RemoteRow[] = []
    // In batches: the ids travel in the address, which has a length limit.
    for (let start = 0; start < ids.length; start += 100) {
      const { data, error } = await this.client
        .from('cookies')
        .select('id, data, edited_at, deleted, changed_at')
        .in('id', ids.slice(start, start + 100))
      if (error) throw new Error(`Could not read the cloud journal: ${error.message}`)
      rows.push(...(data as RemoteRow[]))
    }
    return rows
  }

  async push(rows: PushRow[]): Promise<void> {
    if (rows.length === 0) return
    // No user id is sent: the database fills it in from the session, and its
    // rules refuse rows that belong to anyone else.
    const { error } = await this.client.from('cookies').upsert(rows, { onConflict: 'user_id,id' })
    if (error) throw new Error(`Could not save to the cloud journal: ${error.message}`)
  }

  async uploadPhoto(cookieId: string, name: PhotoName, bytes: ArrayBuffer): Promise<void> {
    const { error } = await this.client.storage
      .from(BUCKET)
      .upload(this.path(cookieId, name), new Blob([bytes], { type: 'image/jpeg' }), {
        upsert: true,
        contentType: 'image/jpeg',
      })
    if (error) throw new Error(`Could not upload a photo: ${error.message}`)
  }

  async downloadPhoto(cookieId: string, name: PhotoName): Promise<ArrayBuffer | null> {
    const { data, error } = await this.client.storage
      .from(BUCKET)
      .download(this.path(cookieId, name))
    if (error) {
      // "Not there" is an answer; anything else (offline, server trouble) is a failure.
      const status = (error as { status?: number; statusCode?: string | number }).status
      const code = (error as { statusCode?: string | number }).statusCode
      if (
        status === 404 ||
        status === 400 ||
        String(code) === '404' ||
        /not found/i.test(error.message)
      ) {
        return null
      }
      throw new Error(`Could not download a photo: ${error.message}`)
    }
    return data.arrayBuffer()
  }

  async removePhotos(cookieId: string, names: PhotoName[] = ['full', 'original']): Promise<void> {
    const { error } = await this.client.storage
      .from(BUCKET)
      .remove(names.map((name) => this.path(cookieId, name)))
    if (error) throw new Error(`Could not remove a photo: ${error.message}`)
  }
}
