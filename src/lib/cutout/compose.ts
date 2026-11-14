/**
 * Lifts the masked cookie out of its photo and sets it down, centered and
 * softly shadowed, on one of the app's tabletops — the same ones the
 * illustrated cookies sit on, so the whole journal looks like one collection.
 */
import { mulberry32, paintSurface } from '@/lib/cookie-art/draw'
import type { SurfaceName } from '@/lib/cookie-art/recipe'
import type { RefinedMask } from './mask'

export const CUTOUT_SIZE = 1600
export const CUTOUT_THUMB = 480
/** Share of the frame the cookie's longer side fills — the same as the illustrated cookies. */
const FILL = 0.66

function canvasOf(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas export failed'))),
      'image/jpeg',
      quality,
    ),
  )
}

/** Average brightness (0–1) of the visible pixels of a cut-out. */
function toneOf(cutout: HTMLCanvasElement): number {
  const probe = canvasOf(32, 32)
  const ctx = probe.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(cutout, 0, 0, 32, 32)
  const { data } = ctx.getImageData(0, 0, 32, 32)
  let sum = 0
  let weight = 0
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]! / 255
    sum += a * (0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!)
    weight += a
  }
  return weight > 0 ? sum / weight / 255 : 0.5
}

/** Pale cookies go on dark tables, dark cookies on light ones. */
function tableFor(tone: number, seed: number): SurfaceName {
  const options: SurfaceName[] =
    tone > 0.7
      ? ['walnut', 'slate']
      : tone < 0.3
        ? ['marble', 'linen', 'parchment', 'blush']
        : ['marble', 'linen', 'parchment']
  return options[seed % options.length]!
}

export interface Composed {
  full: Blob
  thumb: Blob
}

export async function composeCutout(
  photo: ImageBitmap | HTMLImageElement | HTMLCanvasElement,
  photoWidth: number,
  photoHeight: number,
  mask: RefinedMask,
  seed: number,
): Promise<Composed> {
  // The mask as an image whose alpha channel is the shape.
  const stencil = canvasOf(mask.width, mask.height)
  const stencilCtx = stencil.getContext('2d')!
  const pixels = stencilCtx.createImageData(mask.width, mask.height)
  for (let i = 0; i < mask.alpha.length; i++) pixels.data[i * 4 + 3] = mask.alpha[i]!
  stencilCtx.putImageData(pixels, 0, 0)

  // Cut the cookie's bounding box out of the full-resolution photo.
  const sx = photoWidth / mask.width
  const sy = photoHeight / mask.height
  const pad = 2
  const bx = Math.max(0, mask.box.x - pad)
  const by = Math.max(0, mask.box.y - pad)
  const bw = Math.min(mask.width - bx, mask.box.width + pad * 2)
  const bh = Math.min(mask.height - by, mask.box.height + pad * 2)
  const cutout = canvasOf(bw * sx, bh * sy)
  const cutCtx = cutout.getContext('2d')!
  cutCtx.imageSmoothingQuality = 'high'
  cutCtx.drawImage(photo, bx * sx, by * sy, bw * sx, bh * sy, 0, 0, cutout.width, cutout.height)
  cutCtx.globalCompositeOperation = 'destination-in'
  // Scaling the stencil up with smoothing gives the edge a natural feather.
  cutCtx.drawImage(stencil, bx, by, bw, bh, 0, 0, cutout.width, cutout.height)

  const size = CUTOUT_SIZE
  const stage = canvasOf(size, size)
  const ctx = stage.getContext('2d')!
  paintSurface(ctx, size, tableFor(toneOf(cutout), seed), mulberry32(seed))

  const scale = (size * FILL) / Math.max(cutout.width, cutout.height)
  const width = cutout.width * scale
  const height = cutout.height * scale
  ctx.imageSmoothingQuality = 'high'
  ctx.shadowColor = 'rgba(40,20,5,0.42)'
  ctx.shadowBlur = size * 0.05
  ctx.shadowOffsetX = size * 0.012
  ctx.shadowOffsetY = size * 0.026
  ctx.drawImage(cutout, (size - width) / 2, (size - height) / 2 - size * 0.008, width, height)

  const small = canvasOf(CUTOUT_THUMB, CUTOUT_THUMB)
  const smallCtx = small.getContext('2d')!
  smallCtx.imageSmoothingQuality = 'high'
  smallCtx.drawImage(stage, 0, 0, CUTOUT_THUMB, CUTOUT_THUMB)

  const [full, thumb] = await Promise.all([toBlob(stage, 0.88), toBlob(small, 0.82)])
  return { full, thumb }
}
