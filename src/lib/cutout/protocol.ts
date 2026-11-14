/** Messages between the page and the cookie-finder worker. */
import type { RefinedMask } from './mask'

export type Stage =
  /** Fetching the models for the first time. */
  | 'downloading'
  /** Starting the models up. */
  | 'starting'
  /** Looking at the photo. */
  | 'looking'

export interface CutoutRequest {
  type: 'cutout'
  id: number
  image: ImageBitmap
  /**
   * Where the person tapped to say "the cookie is here". Without it the
   * worker looks for the cookie itself.
   */
  point?: { x: number; y: number }
}

export type WorkerMessage =
  | { type: 'progress'; id: number; stage: Stage; loaded?: number; total?: number }
  /** `mask` is null when nothing cookie-like was found. */
  | { type: 'result'; id: number; mask: RefinedMask | null }
  | { type: 'error'; id: number; message: string }
