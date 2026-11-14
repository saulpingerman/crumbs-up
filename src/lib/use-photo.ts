import { useEffect, useState } from 'react'
import { ILLUSTRATION_SIZE, illustrationUrl, type ArtSource } from '@/lib/cookie-art'
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

interface PhotoState {
  url: string | null
  /** True once we know the answer, including "there is no photo here". */
  settled: boolean
}

/**
 * A cookie's stored photo as an object URL. `version` (the cookie's
 * `updatedAt`) busts the cache after an edit.
 */
export function usePhoto(
  cookieId: string | undefined,
  kind: Kind,
  version: number,
  enabled = true,
): PhotoState {
  const key = `${cookieId}:${version}`
  const cached = kind === 'thumb' && enabled ? (thumbCache.get(key) ?? null) : null
  const [loaded, setLoaded] = useState<{ key: string; url: string | null } | null>(null)

  useEffect(() => {
    if (!cookieId || !enabled || cached) return
    let cancelled = false
    let created: string | null = null
    void load(cookieId, kind).then((url) => {
      if (cancelled) {
        if (url) URL.revokeObjectURL(url)
        return
      }
      created = url
      if (url && kind === 'thumb') thumbCache.set(key, url)
      setLoaded({ key, url })
    })
    return () => {
      cancelled = true
      if (created && kind === 'full') {
        const revoked = created
        URL.revokeObjectURL(revoked)
        // Forget it too, or a later render could hand out the dead URL.
        setLoaded((current) => (current?.url === revoked ? null : current))
      }
    }
  }, [cookieId, kind, key, enabled, cached])

  if (!enabled) return { url: null, settled: false }
  if (cached) return { url: cached, settled: true }
  return loaded?.key === key ? { url: loaded.url, settled: true } : { url: null, settled: false }
}

/** Object URL for a cookie's photo, or `null` while loading / when missing. */
export function usePhotoUrl(
  cookieId: string | undefined,
  kind: Kind,
  version: number,
  enabled = true,
): string | null {
  return usePhoto(cookieId, kind, version, enabled).url
}

export type ImageSource = ArtSource & { hasPhoto: boolean; updatedAt: number }

/**
 * What to show for a cookie: its photo when it has one, otherwise an
 * illustration drawn from its type and review. `url` is null while loading.
 */
export function useCookieImage(
  cookie: ImageSource,
  kind: Kind,
  enabled = true,
): { url: string | null; illustrated: boolean } {
  const photo = usePhoto(cookie.id, kind, cookie.updatedAt, enabled && cookie.hasPhoto)
  // A cookie synced from another device can say it has a photo before the
  // picture itself has arrived; until then it gets the illustration.
  const photoMissing = cookie.hasPhoto && photo.settled && !photo.url
  const wantArt = enabled && (!cookie.hasPhoto || photoMissing)
  const key = `${cookie.id}:${cookie.updatedAt}:${kind}`
  const [art, setArt] = useState<{ key: string; url: string } | null>(null)

  useEffect(() => {
    if (!wantArt) return
    let cancelled = false
    illustrationUrl(cookie, cookie.updatedAt, ILLUSTRATION_SIZE[kind])
      .then((url) => {
        if (!cancelled) setArt({ key, url })
      })
      .catch((error: unknown) => console.warn('Could not draw the cookie', error))
    return () => {
      cancelled = true
    }
    // The drawing depends only on what `key` already captures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantArt, key])

  if (cookie.hasPhoto && !photoMissing) return { url: photo.url, illustrated: false }
  return { url: wantArt && art?.key === key ? art.url : null, illustrated: true }
}
