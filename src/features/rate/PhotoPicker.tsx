import { Camera, ImagePlus, LoaderCircle, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/Button'
import type { DraftRecord, ProcessedPhoto } from '@/lib/db/schema'
import { cn } from '@/lib/cn'
import { PhotoError, processPhoto } from '@/lib/image'
import { toObjectUrl } from '@/lib/object-url'
import { usePhotoUrl } from '@/lib/use-photo'

interface Props {
  photo: DraftRecord['photo']
  /** Cookie being edited, whose saved photo `keep` refers to. */
  editId: string | null
  onChange: (photo: ProcessedPhoto | 'none') => void
}

export function PhotoPicker({ photo, editId, onChange }: Props) {
  const cameraInput = useRef<HTMLInputElement>(null)
  const libraryInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)

  const saved = usePhotoUrl(editId ?? undefined, 'full', 0, photo === 'keep')
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

  async function accept(file: File | undefined) {
    if (!file) return
    setBusy(true)
    try {
      onChange(await processPhoto(file))
    } catch (error) {
      toast.error(error instanceof PhotoError ? error.message : 'Couldn’t use that photo')
    } finally {
      setBusy(false)
    }
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
    return (
      <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-oat shadow-card">
        {inputs}
        {preview && (
          <img src={preview} alt="Your cookie" className="size-full animate-fade object-cover" />
        )}
        <div className="absolute inset-x-0 bottom-0 flex justify-end gap-2 bg-gradient-to-t from-black/55 to-transparent p-3 pt-10">
          <Button
            size="sm"
            variant="secondary"
            className="border-transparent bg-white/92 text-[#2a1810] hover:bg-white"
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
            className="border-transparent bg-white/92 px-3 text-[#2a1810] hover:bg-white"
            onClick={() => onChange('none')}
            disabled={busy}
          >
            <Trash2 className="size-4" />
          </Button>
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
            <p className="mt-0.5 text-sm text-ink-soft">Take the photo before the first bite.</p>
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
