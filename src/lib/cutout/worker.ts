/// <reference lib="webworker" />
/**
 * Finds the cookie in a photo, off the main thread.
 *
 * Uses Google's MediaPipe Interactive Segmenter: given a photo and a point
 * on the thing you care about, it returns a mask of that thing. The photo
 * never leaves the device — only the model file is downloaded, once, and
 * then kept in the browser's cache so this works offline afterwards.
 */
import { InteractiveSegmenter } from '@mediapipe/tasks-vision'
import wasmLoaderUrl from '@mediapipe/tasks-vision/vision_wasm_module_internal.js?url'
import wasmBinaryUrl from '@mediapipe/tasks-vision/vision_wasm_module_internal.wasm?url'
import type { SegmentRequest, Stage, WorkerMessage } from './protocol'

declare const self: DedicatedWorkerGlobalScope

const MODEL_URL: string =
  import.meta.env.VITE_COOKIE_FINDER_MODEL_URL ??
  'https://storage.googleapis.com/mediapipe-models/interactive_segmenter_v2/magic_touch/int8/1/interactive_segmentation.task'

const CACHE_NAME = 'cookie-finder-v1'
/** `BrushMode.POSITIVE` — "this point is on the object". */
const POSITIVE = 1

const post = (message: WorkerMessage, transfer: Transferable[] = []) =>
  self.postMessage(message, transfer)

/** Fetch a large file once and keep it in Cache Storage for next time. */
async function fetchCached(
  url: string,
  onProgress: (loaded: number, total: number) => void,
): Promise<Uint8Array> {
  const cache = 'caches' in self ? await caches.open(CACHE_NAME).catch(() => null) : null
  const hit = await cache?.match(url)
  if (hit) return new Uint8Array(await hit.arrayBuffer())

  const response = await fetch(url)
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status})`)
  const total = Number(response.headers.get('content-length')) || 0
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.byteLength
    onProgress(loaded, total)
  }
  const bytes = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  await cache
    ?.put(
      url,
      new Response(bytes, {
        headers: {
          'content-type': response.headers.get('content-type') ?? 'application/octet-stream',
          'content-length': String(loaded),
        },
      }),
    )
    // A full disk shouldn't stop this run; it just won't be cached.
    .catch(() => {})
  return bytes
}

let segmenter: Promise<InteractiveSegmenter> | null = null
let currentImage: string | null = null

function start(report: (stage: Stage, loaded?: number, total?: number) => void) {
  segmenter ??= (async () => {
    // Downloaded together so the progress bar covers everything.
    const sizes = { model: [0, 0], wasm: [0, 0] }
    const tick = () =>
      report('downloading', sizes.model[0]! + sizes.wasm[0]!, sizes.model[1]! + sizes.wasm[1]!)
    const [model, wasm] = await Promise.all([
      fetchCached(MODEL_URL, (loaded, total) => {
        sizes.model = [loaded, total]
        tick()
      }),
      fetchCached(new URL(wasmBinaryUrl, self.location.href).href, (loaded, total) => {
        sizes.wasm = [loaded, total]
        tick()
      }),
    ])
    report('starting')
    const fileset = {
      wasmLoaderPath: new URL(wasmLoaderUrl, self.location.href).href,
      wasmBinaryPath: URL.createObjectURL(
        new Blob([wasm as BlobPart], { type: 'application/wasm' }),
      ),
    }
    return InteractiveSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: model },
    })
  })()
  // A failed start (offline, say) shouldn't poison later attempts.
  segmenter.catch(() => {
    segmenter = null
  })
  return segmenter
}

async function handle(request: SegmentRequest) {
  const { id, image, imageKey, point } = request
  const report = (stage: Stage, loaded?: number, total?: number) =>
    post({ type: 'progress', id, stage, loaded, total })
  try {
    const task = await start(report)
    report('looking')
    if (currentImage !== imageKey) {
      // The expensive half: encode the photo. Taps after this are quick.
      task.setImage(image)
      currentImage = imageKey
    }
    const mask = task.segment([{ brushMode: POSITIVE, point: [point], isCompleted: true }])
    const data = mask.getAsFloat32Array().slice()
    const { width, height } = mask
    mask.close()
    post({ type: 'result', id, mask: data, width, height }, [data.buffer])
  } catch (error) {
    currentImage = null
    post({ type: 'error', id, message: error instanceof Error ? error.message : String(error) })
  } finally {
    image.close()
  }
}

// One photo at a time: the model is not re-entrant.
let queue: Promise<void> = Promise.resolve()
self.onmessage = (event: MessageEvent<SegmentRequest>) => {
  if (event.data.type === 'segment') queue = queue.then(() => handle(event.data))
}
