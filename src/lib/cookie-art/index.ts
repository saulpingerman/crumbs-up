import { drawCookie } from './draw'
import { artFor, type ArtSource } from './recipe'

export { artFor, type ArtSource, type CookieArt } from './recipe'

/** Pixel sizes used around the app. */
export const ILLUSTRATION_SIZE = { thumb: 480, full: 1200 } as const

const cache = new Map<string, Promise<string>>()
/**
 * Only full-size drawings are ever released, and only once several newer
 * ones exist: at most one or two are on screen at a time (a cookie's page,
 * a scorecard being made), so the sixth-oldest cannot be one of them.
 * Thumbnails are small and may be showing anywhere in the journal, so they
 * are kept for the session.
 */
const FULL_SIZE_LIMIT = 6
const fullSizeKeys: string[] = []

/** Drawings wait their turn so a long journal never blocks a frame for long. */
let queue: Promise<unknown> = Promise.resolve()
const nextFrame = () =>
  new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve())
    else setTimeout(resolve, 0)
  })

function draw(source: ArtSource, size: number): Promise<string> {
  const job = queue.then(nextFrame).then(
    () =>
      new Promise<string>((resolve, reject) => {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = size
        drawCookie(canvas, artFor(source))
        canvas.toBlob(
          (blob) =>
            blob ? resolve(URL.createObjectURL(blob)) : reject(new Error('Canvas export failed')),
          'image/jpeg',
          0.88,
        )
      }),
  )
  queue = job.catch(() => {})
  return job
}

/**
 * An object URL for the cookie's illustration at the given pixel size,
 * drawn once and remembered.
 */
export function illustrationUrl(source: ArtSource, version: number, size: number): Promise<string> {
  const key = `${source.id}:${version}:${size}`
  const cached = cache.get(key)
  if (cached) return cached

  const created = draw(source, size)
  cache.set(key, created)
  created.catch(() => cache.delete(key))

  if (size >= ILLUSTRATION_SIZE.full) {
    fullSizeKeys.push(key)
    while (fullSizeKeys.length > FULL_SIZE_LIMIT) {
      const oldKey = fullSizeKeys.shift()!
      const old = cache.get(oldKey)
      cache.delete(oldKey)
      void old?.then((url) => URL.revokeObjectURL(url)).catch(() => {})
    }
  }
  return created
}
