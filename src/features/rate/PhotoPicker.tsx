import { useLiveQuery } from 'dexie-react-hooks'
import { Camera, ImagePlus, LoaderCircle, MousePointerClick, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/Button'
import { Segmented } from '@/components/Field'
import { cn } from '@/lib/cn'
import type { Point, Progress } from '@/lib/cutout'
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

  async function cutOut(source: ProcessedPhoto, point: Point | undefined, asked: boolean) {
    const token = ++run.current
    setFinding('starting')
    try {
      const { cutOutCookie } = await import('@/lib/cutout')
      const result = await cutOutCookie(source, point, (progress) => {
        if (run.current === token) setFinding(progress)
      })
      if (run.current !== token) return
      if (result) onChange(result)
      else if (point) {
        toast('Couldn’t find a cookie there', {
          description: 'Tap right on the cookie to try again, or keep the photo as it is.',
        })
      } else {
        // Left alone on purpose: a photo as taken beats a wrong thing cut out of it.
        toast('Couldn’t pick out the cookie', {
          description: 'Tap it in the photo to cut it out, or keep the photo as it is.',
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

  /** Tapping the original photo says "the cookie is here". */
  async function pick(event: MouseEvent<HTMLImageElement>) {
    if (view !== 'original' || finding) return
    const img = event.currentTarget
    const box = img.getBoundingClientRect()
    // Undo `object-fit: cover` to get from the tap to a spot on the photo.
    const scale = Math.max(box.width / img.naturalWidth, box.height / img.naturalHeight)
    const x =
      (event.clientX - box.left - (box.width - img.naturalWidth * scale) / 2) /
      (img.naturalWidth * scale)
    const y =
      (event.clientY - box.top - (box.height - img.naturalHeight * scale) / 2) /
      (img.naturalHeight * scale)
    const source = await current()
    if (source)
      await cutOut(source, { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) }, true)
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
        <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-oat shadow-card">
          {inputs}
          {preview && (
            // Tapping is a shortcut; the Cut-out switch below does the same from the keyboard.
            // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
            <img
              src={preview}
              alt={view === 'cutout' ? 'Your cookie, cut out of its photo' : 'Your cookie'}
              data-view={view}
              onClick={(e) => void pick(e)}
              className={cn(
                'size-full animate-fade object-cover',
                view === 'original' && !working && 'cursor-crosshair',
              )}
            />
          )}

          {finding !== null && (
            <div
              role="status"
              className="absolute inset-x-0 top-3 mx-auto flex w-fit max-w-[90%] items-center gap-2 rounded-2xl bg-black/60 px-4 py-2 text-sm font-semibold text-white backdrop-blur-md"
            >
              <LoaderCircle className="size-4 shrink-0 animate-spin" />
              {describe(finding === 'starting' ? null : finding)}
            </div>
          )}

          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-end gap-2 p-3">
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
            {view === 'original' ? (
              <>
                <MousePointerClick className="size-4 shrink-0" aria-hidden />
                Tap the cookie to lift it out of the photo.
              </>
            ) : (
              'Wrong thing cut out? Switch to Original and tap the cookie.'
            )}
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
          <LoaderCircle className="size-8 animate-spin text-crust" />
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
