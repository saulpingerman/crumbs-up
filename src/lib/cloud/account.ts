/**
 * Deleting an account for good: its photos, its journal, and the account.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

const BUCKET = 'photos'

/** This copy of the app's database hasn't been given the means to delete accounts. */
export class DeletionUnavailableError extends Error {
  constructor() {
    super('Deleting accounts isn’t switched on for this copy of the app.')
  }
}

/** Remove every photo the person has stored. Photos are files, so nothing else will. */
async function removeAllPhotos(client: SupabaseClient, userId: string): Promise<void> {
  let before: string | null = null
  for (;;) {
    // One folder per cookie, holding its picture and, for a cut-out, the original.
    const { data, error } = await client.storage.from(BUCKET).list(userId, { limit: 100 })
    if (error) throw new Error(`Could not read the stored photos: ${error.message}`)
    if (!data || data.length === 0) return
    const first = data[0]!.name
    // Folders go once they are empty. One still there after a round means its
    // files couldn't be removed; say so rather than go round for ever.
    if (first === before) throw new Error('Some stored photos could not be removed.')
    before = first
    const { error: failed } = await client.storage
      .from(BUCKET)
      .remove(
        data.flatMap((folder) => [
          `${userId}/${folder.name}/full.jpg`,
          `${userId}/${folder.name}/original.jpg`,
        ]),
      )
    if (failed) throw new Error(`Could not remove the stored photos: ${failed.message}`)
  }
}

/**
 * Delete the signed-in person's account and everything kept in it.
 * Nothing on this device is touched; that is the caller's decision.
 */
export async function deleteAccount(client: SupabaseClient, userId: string): Promise<void> {
  // Ask first whether the database can do this at all — before removing
  // anything, so a "no" leaves the account exactly as it was.
  const able = await client.rpc('delete_my_account', { really: false })
  if (able.error) throw new DeletionUnavailableError()

  await removeAllPhotos(client, userId)

  // The journal's rows belong to the account and go with it.
  const { error } = await client.rpc('delete_my_account', { really: true })
  if (error) throw new Error(`Could not delete the account: ${error.message}`)
}
