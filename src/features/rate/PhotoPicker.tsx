import { useLiveQuery } from 'dexie-react-hooks'
import { Camera, ImagePlus, LoaderCircle, MousePointerClick, Trash2, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/Button'
import { RollingCookie } from '@/components/RollingCookie'
import { Segmented } from '@/components/Field'
import { cn } from '@/lib/cn'
import type { Pick, Point, Progress } from '@/lib/cutout'
import { loadPhoto } from '@/lib/db/cookies'
import { db } from '@/lib/db/db'
import type { DraftRecord, ProcessedPhoto } from '@/lib/db/schema'
import { PhotoError, processPhoto, withThumbnail } from '@/lib/image'
import { toObjectUrl } from '@/lib/object-url'
import { useSettings } from '@/lib/settings'
import { usePhotoUrl } from '@/lib/use-photo'

interface Props {
  photo: DraftRecord['photo']
  /** Cookie being edited, whose saved photo `keep` refers to. */
  editId: string | null
  onChange: (photo: ProcessedPhoto | 'none') => void
}

type View = 'cutout' | 'original'

/** A finger that has moved less than this (in pixels) was a tap, not a drawing. */
const TAP_SLOP = 14

/** People on a metered connection have asked their browser to go easy. */
function savingData(): boolean {
  return (
    (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true
  )
}

function describe(progress: Progress | null): string {
  if (progress?.stage === 'downloading' && (progress.fraction ?? 0) < 1) {
    const percent =
      progress.fraction === undefined ? '' : ` ${Math.round(progress.fraction * 100)}%`
    return `Downloading the cookie finder…${percent}`
  }
  return 'Finding your cookie…'
}

export function PhotoPicker({ photo, editId, onChange }: Props) {
  const { autoCutout } = useSettings()
  const cameraInput = useRef<HTMLInputElement>(null)
  const libraryInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  /** Set while the cookie finder is running. */
  const [finding, setFinding] = useState<Progress | 'starting' | null>(null)
  /** Bumped whenever the photo changes, so a slow cut-out can't land on a newer photo. */
  const run = useRef(0)
  const image = useRef<HTMLImageElement>(null)
  /** Width over height of the photo on show, once it has loaded. */
  const [shape, setShape] = useState<number | null>(null)
  /** The loop being drawn around the cookie, as spots on the picture box (0–1). */
  const [loop, setLoop] = useState<Point[] | null>(null)
  const drawing = useRef<{ x: number; y: number }[] | null>(null)

  const saved = usePhotoUrl(editId ?? undefined, 'full', 0, photo === 'keep')
  const savedIsCutout = useLiveQuery(
    async () =>
      editId ? (await db.originals.where('cookieId').equals(editId).count()) > 0 : false,
    [editId],
  )

  const picked = photo === 'keep' || photo === 'none' ? null : photo
  const [fresh, setFresh] = useState<{ of: ProcessedPhoto; url: string } | null>(null)
  useEffect(() => {
    if (!picked) return
    const url = toObjectUrl(picked.full, picked.mime)
    // The object URL is a browser resource this effect creates and releases,
    // so it has to be stored from here rather than derived during render.
    // oxlint-disable-next-line react/set-state-in-effect
    setFresh({ of: picked, url })
    return () => URL.revokeObjectURL(url)
  }, [picked])

  const preview = photo === 'keep' ? saved : fresh && fresh.of === picked ? fresh.url : null
  const view: View = (picked ? Boolean(picked.original) : savedIsCutout) ? 'cutout' : 'original'

  /** The photo currently in play, in editable form. */
  async function current(): Promise<ProcessedPhoto | null> {
    if (photo === 'none') return null
    if (photo === 'keep') return editId ? loadPhoto(editId) : null
    return photo
  }

  async function cutOut(source: ProcessedPhoto, pick: Pick | undefined, asked: boolean) {
    const token = ++run.current
    setFinding('starting')
    try {
      const { cutOutCookie } = await import('@/lib/cutout')
      const result = await cutOutCookie(source, pick, (progress) => {
        if (run.current === token) setFinding(progress)
      })
      if (run.current !== token) return
      if (result) onChange(result)
      else if (pick) {
        toast('Couldn’t find a cookie there', {
          description: 'Tap right on the cookie, or draw a circle around it, to try again.',
        })
      } else {
        // Left alone on purpose: a photo as taken beats a wrong thing cut out of it.
        toast('Couldn’t pick out the cookie', {
          description: 'Tap it in the photo, or draw a circle around it, to cut it out.',
        })
      }
    } catch (error) {
      console.warn('Cookie finder failed', error)
      if (run.current === token && asked) {
        toast.error('The cookie finder couldn’t load', {
          description: 'It needs a connection the first time. Your photo is fine as it is.',
        })
      }
    } finally {
      if (run.current === token) setFinding(null)
    }
  }

  async function accept(file: File | undefined) {
    if (!file) return
    run.current++
    setFinding(null)
    setBusy(true)
    try {
      const processed = await processPhoto(file)
      onChange(processed)
      if (autoCutout && !savingData()) void cutOut(processed, undefined, false)
    } catch (error) {
      toast.error(error instanceof PhotoError ? error.message : 'Couldn’t use that photo')
    } finally {
      setBusy(false)
    }
  }

  async function show(next: View) {
    if (next === view || finding) return
    const source = await current()
    if (!source) return
    if (next === 'cutout') {
      await cutOut(source, undefined, true)
    } else if (source.original) {
      run.current++
      onChange(await withThumbnail(source.original))
    }
  }

  /** Where on the photo a spot on the screen is (0–1), with the whole photo on show. */
  function onPhoto(clientX: number, clientY: number): Point | null {
    const img = image.current
    if (!img || !img.naturalWidth) return null
    const box = img.getBoundingClientRect()
    // Undo `object-fit: contain`.
    const scale = Math.min(box.width / img.naturalWidth, box.height / img.naturalHeight)
    const x =
      (clientX - box.left - (box.width - img.naturalWidth * scale) / 2) / (img.naturalWidth * scale)
    const y =
      (clientY - box.top - (box.height - img.naturalHeight * scale) / 2) /
      (img.naturalHeight * scale)
    return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) }
  }

  const pickable = view === 'original' && !busy && finding === null

  /**
   * On the original photo, a tap says "the cookie is here" and a loop drawn
   * around it says "the cookie is in here".
   */
  function startPick(event: PointerEvent<SVGSVGElement>) {
    if (!pickable || !event.isPrimary) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drawing.current = [{ x: event.clientX, y: event.clientY }]
  }

  function movePick(event: PointerEvent<SVGSVGElement>) {
    const path = drawing.current
    if (!path) return
    const last = path[path.length - 1]!
    if (Math.hypot(event.clientX - last.x, event.clientY - last.y) < 4) return
    path.push({ x: event.clientX, y: event.clientY })
    // Shown once it is clearly a drawing rather than an unsteady tap.
    const box = event.currentTarget.getBoundingClientRect()
    const start = path[0]!
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_SLOP || loop) {
      setLoop(
        path.map((spot) => ({
          x: (spot.x - box.left) / box.width,
          y: (spot.y - box.top) / box.height,
        })),
      )
    }
  }

  async function endPick(event: PointerEvent<SVGSVGElement>) {
    const path = drawing.current
    drawing.current = null
    setLoop(null)
    if (!path || !pickable) return
    const reach = Math.max(
      ...path.map((spot) => Math.hypot(spot.x - path[0]!.x, spot.y - path[0]!.y)),
    )
    const spots = (reach > TAP_SLOP ? path : [{ x: event.clientX, y: event.clientY }])
      .map((spot) => onPhoto(spot.x, spot.y))
      .filter((spot): spot is Point => spot !== null)
    const source = await current()
    if (!source || spots.length === 0) return
    await cutOut(source, spots.length >= 3 ? spots : spots[0]!, true)
  }

  const inputs = (
    <>
      {/* Two inputs on purpose: newer Android pickers hide the camera unless
          `capture` is set, and iOS skips the library when it is. */}
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          void accept(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <input
        ref={libraryInput}
        type="file"
        accept="image/*"
        hidden
        data-testid="photo-input"
        onChange={(e) => {
          void accept(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </>
  )

  if (photo !== 'none') {
    const working = busy || finding !== null
    return (
      <div>
        <div
          className="relative overflow-hidden rounded-3xl bg-oat shadow-card"
          // The original is shown whole, so a cookie at the edge of the photo
          // can still be pointed at; the cut-out is always a tidy 4:3.
          style={{
            aspectRatio: view === 'original' && shape ? Math.min(1.6, Math.max(0.7, shape)) : 4 / 3,
          }}
        >
          {inputs}
          {preview && (
            <img
              ref={image}
              src={preview}
              alt={view === 'cutout' ? 'Your cookie, cut out of its photo' : 'Your cookie'}
              data-view={view}
              onLoad={(e) =>
                setShape(e.currentTarget.naturalWidth / Math.max(1, e.currentTarget.naturalHeight))
              }
              className={cn(
                'size-full animate-fade',
                view === 'original' ? 'object-contain' : 'object-cover',
              )}
            />
          )}
          {preview && view === 'original' && (
            // Pointing at the photo is a shortcut; the Cut-out switch below
            // finds the cookie without it, from the keyboard too.
            <svg
              data-testid="pick-cookie"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden
              className={cn(
                'absolute inset-0 size-full touch-none',
                pickable && 'cursor-crosshair',
              )}
              onPointerDown={startPick}
              onPointerMove={movePick}
              onPointerUp={(e) => void endPick(e)}
              onPointerCancel={() => {
                drawing.current = null
                setLoop(null)
              }}
            >
              {loop && (
                <polyline
                  points={loop.map((spot) => `${spot.x * 100},${spot.y * 100}`).join(' ')}
                  fill="rgb(255 255 255 / 0.18)"
                  stroke="white"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  style={{ filter: 'drop-shadow(0 0 2px rgb(0 0 0 / 0.7))' }}
                />
              )}
            </svg>
          )}

          {pickable && !loop && (
            <p className="pointer-events-none absolute inset-x-0 top-3 mx-auto flex w-fit max-w-[90%] items-center gap-2 rounded-2xl bg-black/60 px-4 py-2 text-sm font-semibold text-white backdrop-blur-md">
              <MousePointerClick className="size-4 shrink-0" aria-hidden />
              Tap the cookie, or circle it
            </p>
          )}

          {finding !== null && (
            <div
              role="status"
              className="absolute inset-x-0 top-3 mx-auto flex w-fit max-w-[90%] items-center gap-2 rounded-2xl bg-black/60 px-4 py-2 text-sm font-semibold text-white backdrop-blur-md"
            >
              <RollingCookie className="text-xl" />
              {describe(finding === 'starting' ? null : finding)}
            </div>
          )}

          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-end gap-2 p-3">
            {view === 'cutout' && !working && (
              <Button
                size="sm"
                variant="secondary"
                className="pointer-events-auto mr-auto border-transparent bg-white/92 text-[#2a1810] shadow-card hover:bg-white"
                onClick={() => void show('original')}
              >
                <Undo2 className="size-4" />
                Not the cookie?
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              className="pointer-events-auto border-transparent bg-white/92 text-[#2a1810] shadow-card hover:bg-white"
              onClick={() => libraryInput.current?.click()}
              disabled={busy}
            >
              {busy ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <ImagePlus className="size-4" />
              )}
              Replace
            </Button>
            <Button
              size="sm"
              variant="secondary"
              aria-label="Remove photo"
              className="pointer-events-auto border-transparent bg-white/92 px-3 text-[#2a1810] shadow-card hover:bg-white"
              onClick={() => {
                run.current++
                setFinding(null)
                onChange('none')
              }}
              disabled={busy}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <Segmented<View>
            label="How to show the photo"
            value={view}
            onChange={(next) => void show(next)}
            options={[
              { value: 'cutout', label: 'Cut-out' },
              { value: 'original', label: 'Original' },
            ]}
          />
          <p className="flex min-w-0 flex-1 basis-40 items-center gap-1.5 text-[13px] leading-snug text-ink-soft">
            {view === 'original'
              ? 'Your photo as you took it. Point out the cookie to lift it out.'
              : 'Lifted out of your photo and set on a clean tabletop.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        void accept(e.dataTransfer.files[0])
      }}
      className={cn(
        'grain flex aspect-[4/3] flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-line bg-paper px-6 text-center transition',
        dragging && 'border-crust bg-texture-soft',
      )}
    >
      {inputs}
      {busy ? (
        <>
          <RollingCookie className="text-4xl" />
          <p className="text-sm font-semibold text-ink-soft">Developing your photo…</p>
        </>
      ) : (
        <>
          <span className="flex size-14 items-center justify-center rounded-full bg-oat text-crust">
            <Camera className="size-7" strokeWidth={1.8} />
          </span>
          <div>
            <p className="font-display text-xl font-semibold">Get its good side</p>
            <p className="mt-0.5 text-sm text-ink-soft">
              Take the photo before the first bite. No photo? We’ll sketch the cookie from your
              answers.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => cameraInput.current?.click()}>
              <Camera className="size-4" />
              Take photo
            </Button>
            <Button variant="secondary" onClick={() => libraryInput.current?.click()}>
              <ImagePlus className="size-4" />
              Choose photo
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
