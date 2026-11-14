import type { Point, RefinedMask } from './mask'
import type { CutoutRequest, Stage, WorkerMessage } from './protocol'

export interface Progress {
  stage: Stage
  /** 0–1 while downloading, when the size is known. */
  fraction?: number
}

interface Pending {
  resolve: (mask: RefinedMask | null) => void
  reject: (error: Error) => void
  onProgress?: (progress: Progress) => void
}

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, Pending>()

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./worker.ts', import.meta.url), {
    type: 'module',
    name: 'cookie-finder',
  })
  worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
    const message = event.data
    const request = pending.get(message.id)
    if (!request) return
    if (message.type === 'progress') {
      request.onProgress?.({
        stage: message.stage,
        fraction: message.total ? Math.min(1, (message.loaded ?? 0) / message.total) : undefined,
      })
      return
    }
    pending.delete(message.id)
    if (message.type === 'result') request.resolve(message.mask)
    else request.reject(new Error(message.message))
  }
  worker.onerror = (event) => {
    // The worker itself died (out of memory, failed to load). Fail everything
    // in flight and start a fresh one next time.
    for (const request of pending.values())
      request.reject(new Error(event.message || 'Worker failed'))
    pending.clear()
    worker?.terminate()
    worker = null
  }
  return worker
}

/**
 * Ask the worker for the cookie's outline: at `point` if someone tapped
 * there (trimmed to `around`, if they drew a loop), otherwise wherever it
 * finds one. Resolves to null if there's no cookie to be found.
 */
export function findOutline(
  image: ImageBitmap,
  point: Point | undefined,
  around: Point[] | undefined,
  onProgress?: (progress: Progress) => void,
): Promise<RefinedMask | null> {
  return new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject, onProgress })
    const request: CutoutRequest = { type: 'cutout', id, image, point, around }
    getWorker().postMessage(request, [image])
  })
}
