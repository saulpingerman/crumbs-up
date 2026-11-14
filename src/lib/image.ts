import Compressor from 'compressorjs'
import type { PhotoImages, ProcessedPhoto } from '@/lib/db/schema'

const FULL_EDGE = 1600
const THUMB_EDGE = 480
const MIME = 'image/jpeg'

function compress(file: Blob, maxEdge: number, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    new Compressor(file as File, {
      maxWidth: maxEdge,
      maxHeight: maxEdge,
      quality,
      mimeType: MIME,
      // Always re-encode, so every stored photo is a JPEG of a known size.
      convertSize: 0,
      convertTypes: ['image/png', 'image/webp', 'image/heic', 'image/heif'],
      success: resolve,
      error: reject,
    })
  })
}

async function measure(blob: Blob): Promise<{ width: number; height: number }> {
  if ('createImageBitmap' in globalThis) {
    const bitmap = await createImageBitmap(blob)
    const size = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return size
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read that image'))
    }
    img.src = url
  })
}

export class PhotoError extends Error {}

/**
 * Shrink a camera photo to something sensible to keep on a phone forever:
 * a ~1600px original for the detail page and a ~480px thumbnail for grids.
 */
export async function processPhoto(file: Blob): Promise<ProcessedPhoto> {
  if (file.type && !file.type.startsWith('image/')) {
    throw new PhotoError('That file isn’t a photo.')
  }
  try {
    const full = await compress(file, FULL_EDGE, 0.84)
    const thumb = await compress(full, THUMB_EDGE, 0.78)
    const [fullSize, thumbSize] = await Promise.all([measure(full), measure(thumb)])
    return {
      mime: MIME,
      full: await full.arrayBuffer(),
      thumb: await thumb.arrayBuffer(),
      width: fullSize.width,
      height: fullSize.height,
      thumbWidth: thumbSize.width,
      thumbHeight: thumbSize.height,
    }
  } catch (error) {
    if (error instanceof PhotoError) throw error
    throw new PhotoError(
      'This browser couldn’t open that photo. Try a JPEG or PNG, or take a new one.',
    )
  }
}

/** Make a fresh thumbnail for a photo whose full-size bytes are kept as they are. */
export async function withThumbnail(photo: PhotoImages): Promise<PhotoImages> {
  const thumb = await compress(new Blob([photo.full], { type: photo.mime }), THUMB_EDGE, 0.78)
  const size = await measure(thumb)
  return {
    mime: photo.mime,
    full: photo.full,
    width: photo.width,
    height: photo.height,
    thumb: await thumb.arrayBuffer(),
    thumbWidth: size.width,
    thumbHeight: size.height,
  }
}

/** Rebuild a stored photo from just its bytes (as downloaded from the cloud copy). */
export async function photoFromBytes(full: ArrayBuffer): Promise<PhotoImages> {
  const size = await measure(new Blob([full], { type: MIME }))
  return withThumbnail({
    mime: MIME,
    full,
    width: size.width,
    height: size.height,
    thumb: full,
    thumbWidth: size.width,
    thumbHeight: size.height,
  })
}
