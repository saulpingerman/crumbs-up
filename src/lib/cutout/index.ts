import { hash } from '@/lib/cookie-art/recipe'
import type { PhotoImages, ProcessedPhoto } from '@/lib/db/schema'
import { findOutline, type Progress } from './client'
import { composeCutout, CUTOUT_SIZE, CUTOUT_THUMB } from './compose'
import type { Point } from './mask'

export type { Progress } from './client'
export type { Point } from './mask'

/** The model sees the photo at up to this size; the cut itself is full-res. */
const ANALYSIS_EDGE = 1024

/** The untouched photo behind a cut-out (or the photo itself if it isn't one). */
export function originalOf(photo: ProcessedPhoto): PhotoImages {
  return photo.original ?? photo
}

/**
 * Cut the cookie out of a photo and set it on a clean tabletop.
 *
 * With a `point` — someone tapped the cookie — it cuts out whatever is
 * there. Without one it finds the cookie itself.
 *
 * Resolves to the new picture (which carries the original inside it, so
 * nothing is lost), or `null` when no cookie could be found.
 * Rejects if the cookie finder itself couldn't run — offline before its
 * first download, for example.
 */
export async function cutOutCookie(
  photo: ProcessedPhoto,
  point?: Point,
  onProgress?: (progress: Progress) => void,
): Promise<ProcessedPhoto | null> {
  const original = originalOf(photo)
  const blob = new Blob([original.full], { type: original.mime })
  const scale = Math.min(1, ANALYSIS_EDGE / Math.max(original.width, original.height))
  const [picture, analysis] = await Promise.all([
    createImageBitmap(blob),
    createImageBitmap(blob, {
      resizeWidth: Math.max(1, Math.round(original.width * scale)),
      resizeHeight: Math.max(1, Math.round(original.height * scale)),
      resizeQuality: 'high',
    }),
  ])

  try {
    const mask = await findOutline(analysis, point, onProgress)
    if (!mask) return null

    // The same photo always lands on the same tabletop.
    const seed = hash(
      `${original.full.byteLength}:${original.width}x${original.height}:${String(
        new Uint8Array(original.full, 0, Math.min(2048, original.full.byteLength)),
      )}`,
    )
    const composed = await composeCutout(picture, original.width, original.height, mask, seed)
    const [full, thumb] = await Promise.all([
      composed.full.arrayBuffer(),
      composed.thumb.arrayBuffer(),
    ])
    return {
      mime: 'image/jpeg',
      full,
      thumb,
      width: CUTOUT_SIZE,
      height: CUTOUT_SIZE,
      thumbWidth: CUTOUT_THUMB,
      thumbHeight: CUTOUT_THUMB,
      original: {
        mime: original.mime,
        full: original.full,
        thumb: original.thumb,
        width: original.width,
        height: original.height,
        thumbWidth: original.thumbWidth,
        thumbHeight: original.thumbHeight,
      },
    }
  } finally {
    picture.close()
  }
}
