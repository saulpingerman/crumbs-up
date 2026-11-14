import { useEffect, useState } from 'react'
import { db } from '@/lib/db/db'
import { toObjectUrl } from '@/lib/object-url'

type Kind = 'thumb' | 'full'

/**
 * Thumbnails are tiny and shown all over the place, so their object URLs are
 * kept for the session. Originals are large, so those are created and
 * released with the component that shows them.
 */
const thumbCache = new Map<string, string>()

export function forgetPhoto(cookieId: string): void {
  for (const [key, url] of thumbCache) {
    if (key.startsWith(`${cookieId}:`)) {
      URL.revokeObjectURL(url)
      thumbCache.delete(key)
    }
  }
}

async function load(cookieId: string, kind: Kind): Promise<string | null> {
  const table = kind === 'thumb' ? db.thumbs : db.photos
  // Safari can drop its IndexedDB connection after the app is backgrounded;
  // one retry lets Dexie reopen it.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const image = await table.get(cookieId)
      return image ? toObjectUrl(image.data, image.mime) : null
    } catch (error) {
      if (attempt === 1) console.warn('Could not read photo', error)
    }
  }
  return null
}

/**
 * Object URL for a cookie's photo, or `null` while loading / when missing.
 * `version` (the cookie's `updatedAt`) busts the cache after an edit.
 */
export function usePhotoUrl(
  cookieId: string | undefined,
  kind: Kind,
  version: number,
  enabled = true,
): string | null {
  const key = `${cookieId}:${version}`
  const cached = kind === 'thumb' && enabled ? (thumbCache.get(key) ?? null) : null
  const [loaded, setLoaded] = useState<{ key: string; url: string } | null>(null)

  useEffect(() => {
    if (!cookieId || !enabled || cached) return
    let cancelled = false
    let created: string | null = null
    void load(cookieId, kind).then((url) => {
      if (!url) return
      if (cancelled) {
        URL.revokeObjectURL(url)
        return
      }
      created = url
      if (kind === 'thumb') thumbCache.set(key, url)
      setLoaded({ key, url })
    })
    return () => {
      cancelled = true
      if (created && kind === 'full') URL.revokeObjectURL(created)
    }
  }, [cookieId, kind, key, enabled, cached])

  if (!enabled) return null
  return cached ?? (loaded?.key === key ? loaded.url : null)
}
