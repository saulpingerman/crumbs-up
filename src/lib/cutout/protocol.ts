/** Messages between the page and the cookie-finder worker. */

export type Stage =
  /** Fetching the model for the first time. */
  | 'downloading'
  /** Starting the model up. */
  | 'starting'
  /** Looking at the photo. */
  | 'looking'

export interface SegmentRequest {
  type: 'segment'
  id: number
  /** Identifies the photo, so repeat taps on it skip the slow first pass. */
  imageKey: string
  image: ImageBitmap
  point: { x: number; y: number }
}

export type WorkerMessage =
  | { type: 'progress'; id: number; stage: Stage; loaded?: number; total?: number }
  | { type: 'result'; id: number; mask: Float32Array; width: number; height: number }
  | { type: 'error'; id: number; message: string }
