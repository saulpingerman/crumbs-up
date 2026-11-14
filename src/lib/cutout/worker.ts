/// <reference lib="webworker" />
/**
 * Finds the cookie in a photo, off the main thread.
 *
 * Two of Google's MediaPipe models do the looking. A small object spotter
 * says roughly where things are; an interactive segmenter, given a point on
 * something, returns that thing's exact outline. `find.ts` decides which
 * points to try and whether the result is a cookie.
 *
 * The photo never leaves the device — only the model files are downloaded,
 * once, and then kept in the browser's cache so this works offline afterwards.
 */
import { InteractiveSegmenter, ObjectDetector } from '@mediapipe/tasks-vision'
import wasmLoaderUrl from '@mediapipe/tasks-vision/vision_wasm_module_internal.js?url'
import wasmBinaryUrl from '@mediapipe/tasks-vision/vision_wasm_module_internal.wasm?url'
import { COLOUR_EDGE, readColours, type Colours } from './colour'
import { findCookie, type Spotted } from './find'
import { keepWithin, refineMask, type Point, type RefinedMask } from './mask'
import type { CutoutRequest, Stage, WorkerMessage } from './protocol'

declare const self: DedicatedWorkerGlobalScope

const MODELS = 'https://storage.googleapis.com/mediapipe-models'
const SEGMENTER_URL: string =
  import.meta.env.VITE_COOKIE_FINDER_MODEL_URL ??
  `${MODELS}/interactive_segmenter_v2/magic_touch/int8/1/interactive_segmentation.task`
const SPOTTER_URL: string =
  import.meta.env.VITE_COOKIE_SPOTTER_MODEL_URL ??
  `${MODELS}/object_detector/efficientdet_lite2/int8/1/efficientdet_lite2.tflite`

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

/**
 * MediaPipe starts each model from a factory that its loader script leaves
 * on the global object — once, the first time the script runs — and which
 * MediaPipe then clears. Put it back before starting a second model.
 */
async function prime(loaderUrl: string) {
  const loader = (await import(/* @vite-ignore */ loaderUrl)) as { default?: unknown }
  if (loader.default) {
    ;(self as unknown as { ModuleFactory?: unknown }).ModuleFactory = loader.default
  }
}

interface Tools {
  segmenter: InteractiveSegmenter
  /** Missing if it couldn't be loaded; the search carries on without it. */
  spotter: ObjectDetector | null
}

let tools: Promise<Tools> | null = null

function start(report: (stage: Stage, loaded?: number, total?: number) => void) {
  tools ??= (async () => {
    // Downloaded together so the progress bar covers everything.
    const sizes = { segmenter: [0, 0], spotter: [0, 0], wasm: [0, 0] }
    const track = (part: keyof typeof sizes) => (loaded: number, total: number) => {
      sizes[part] = [loaded, total]
      const parts = Object.values(sizes)
      report(
        'downloading',
        parts.reduce((sum, [done]) => sum + done!, 0),
        // Until every part has reported its size the total isn't known.
        parts.every(([, size]) => size! > 0) ? parts.reduce((sum, [, size]) => sum + size!, 0) : 0,
      )
    }
    const [segmenterModel, wasm, spotterModel] = await Promise.all([
      fetchCached(SEGMENTER_URL, track('segmenter')),
      fetchCached(new URL(wasmBinaryUrl, self.location.href).href, track('wasm')),
      // The spotter is a help, not a need.
      fetchCached(SPOTTER_URL, track('spotter')).catch((error: unknown) => {
        console.warn('Cookie spotter: download failed', error)
        return null
      }),
    ])
    report('starting')
    const fileset = {
      wasmLoaderPath: new URL(wasmLoaderUrl, self.location.href).href,
      wasmBinaryPath: URL.createObjectURL(
        new Blob([wasm as BlobPart], { type: 'application/wasm' }),
      ),
    }
    const segmenter = await InteractiveSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: segmenterModel },
    })
    const spotter = spotterModel
      ? await prime(fileset.wasmLoaderPath)
          .then(() =>
            ObjectDetector.createFromOptions(fileset, {
              baseOptions: { modelAssetBuffer: spotterModel },
              scoreThreshold: 0.1,
              maxResults: 25,
            }),
          )
          .catch((error: unknown) => {
            console.warn('Cookie spotter: could not start', error)
            return null
          })
      : null
    return { segmenter, spotter }
  })()
  // A failed start (offline, say) shouldn't poison later attempts.
  tools.catch(() => {
    tools = null
  })
  return tools
}

/** What the spotter recognises in the photo, and where. */
function spot(spotter: ObjectDetector | null, image: ImageBitmap): Spotted[] {
  if (!spotter) return []
  try {
    return spotter.detect(image).detections.flatMap((found) => {
      const best = found.categories[0]
      const box = found.boundingBox
      if (!best || !box) return []
      return {
        label: best.categoryName,
        score: best.score,
        x: box.originX / image.width,
        y: box.originY / image.height,
        width: box.width / image.width,
        height: box.height / image.height,
      }
    })
  } catch {
    return []
  }
}

/** What the photo's colours say, if this browser can read pixels in a worker. */
function coloursOf(image: ImageBitmap): Colours | null {
  if (typeof OffscreenCanvas === 'undefined') return null
  const scale = COLOUR_EDGE / Math.max(image.width, image.height)
  const width = Math.max(2, Math.round(image.width * scale))
  const height = Math.max(2, Math.round(image.height * scale))
  const context = new OffscreenCanvas(width, height).getContext('2d', {
    willReadFrequently: true,
  })
  if (!context) return null
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, width, height)
  return readColours(context.getImageData(0, 0, width, height).data, width, height)
}

async function handle(request: CutoutRequest) {
  const { id, image, point, around } = request
  const report = (stage: Stage, loaded?: number, total?: number) =>
    post({ type: 'progress', id, stage, loaded, total })
  try {
    const { segmenter, spotter } = await start(report)
    report('looking')
    segmenter.setImage(image)
    /** The slow part: the outline of whatever is at a point. */
    const look = (at: Point): RefinedMask | null => {
      const mask = segmenter.segment([{ brushMode: POSITIVE, point: [at], isCompleted: true }])
      try {
        return refineMask(mask.getAsFloat32Array(), mask.width, mask.height, at)
      } finally {
        mask.close()
      }
    }
    // A tap or a drawn loop is an instruction; without one, go looking.
    const pointed = point ? look(point) : null
    const mask = point
      ? // The loop trims the shape — unless it misses it, when the shape stands.
        (pointed && around && keepWithin(pointed, around)) || pointed
      : findCookie(spot(spotter, image), coloursOf(image), look)
    post({ type: 'result', id, mask }, mask ? [mask.alpha.buffer] : [])
  } catch (error) {
    post({ type: 'error', id, message: error instanceof Error ? error.message : String(error) })
  } finally {
    image.close()
  }
}

// One photo at a time: the models are not re-entrant.
let queue: Promise<void> = Promise.resolve()
self.onmessage = (event: MessageEvent<CutoutRequest>) => {
  if (event.data.type === 'cutout') queue = queue.then(() => handle(event.data))
}
