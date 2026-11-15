import { Maximize2, Minus, Plus } from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { cn } from '@/lib/cn'

const MOST = 8
/** How far a finger moves before a press is a drag, not a tap. */
const DRAG_SLOP = 6

interface View {
  scale: number
  /** The middle of what's shown, in the drawing's own units. */
  x: number
  y: number
}

/** "x y width height" → numbers. */
function parse(viewBox: string) {
  const [x = 0, y = 0, width = 1, height = 1] = viewBox.split(/[\s,]+/).map(Number)
  return { x, y, width, height }
}

/** Keep the shown part inside the drawing. */
function clamp(view: View, base: ReturnType<typeof parse>): View {
  const scale = Math.min(MOST, Math.max(1, view.scale))
  const halfW = base.width / scale / 2
  const halfH = base.height / scale / 2
  return {
    scale,
    x: Math.min(base.x + base.width - halfW, Math.max(base.x + halfW, view.x)),
    y: Math.min(base.y + base.height - halfH, Math.max(base.y + halfH, view.y)),
  }
}

interface Props {
  /** The whole drawing, as an SVG viewBox. Changing it starts zoomed out again. */
  viewBox: string
  children: ReactNode
  className?: string
  label: string
  onPointerLeave?: () => void
}

/**
 * An SVG map that can be zoomed into: with the + and − buttons, a pinch, a
 * double tap or the mouse wheel, and dragged about once zoomed in. Taps on
 * the shapes inside still work; a drag never counts as one.
 *
 * Zoomed all the way out, one finger scrolls the page as usual. Zoomed in,
 * the map has the finger to itself.
 */
export function ZoomableSvg({ viewBox, children, className, label, onPointerLeave }: Props) {
  const base = parse(viewBox)
  const whole: View = { scale: 1, x: base.x + base.width / 2, y: base.y + base.height / 2 }
  const [view, setView] = useState<View>(whole)
  const svg = useRef<SVGSVGElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{
    start: View
    /** Where the gesture began on screen, and how far apart two fingers were. */
    x: number
    y: number
    spread: number
    moved: boolean
  } | null>(null)
  const swallowClick = useRef(false)
  const lastTap = useRef(0)
  const lastPointer = useRef('mouse')

  // A different drawing (another state picked) starts zoomed out.
  useEffect(() => {
    setView({ scale: 1, x: base.x + base.width / 2, y: base.y + base.height / 2 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewBox])

  const width = base.width / view.scale
  const height = base.height / view.scale
  const shown = `${view.x - width / 2} ${view.y - height / 2} ${width} ${height}`

  /** A point on screen, in the drawing's units for the current view. */
  function toDrawing(clientX: number, clientY: number, from: View = view) {
    const box = svg.current?.getBoundingClientRect()
    if (!box) return { x: from.x, y: from.y }
    const w = base.width / from.scale
    const h = base.height / from.scale
    // preserveAspectRatio "xMidYMid meet": the drawing is letterboxed.
    const fit = Math.min(box.width / w, box.height / h)
    return {
      x: from.x + (clientX - box.left - box.width / 2) / fit,
      y: from.y + (clientY - box.top - box.height / 2) / fit,
    }
  }

  /** Zoom by `factor`, keeping the point under (clientX, clientY) where it is. */
  function zoomAt(factor: number, clientX?: number, clientY?: number, from: View = view) {
    const scale = Math.min(MOST, Math.max(1, from.scale * factor))
    if (clientX === undefined || clientY === undefined) {
      setView(clamp({ ...from, scale }, base))
      return
    }
    const anchor = toDrawing(clientX, clientY, from)
    const k = from.scale / scale
    setView(
      clamp(
        { scale, x: anchor.x + (from.x - anchor.x) * k, y: anchor.y + (from.y - anchor.y) * k },
        base,
      ),
    )
  }

  // The wheel has to be caught before the page scrolls, which React's own
  // listener (passive) can't do.
  useEffect(() => {
    const element = svg.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && Math.abs(event.deltaY) < Math.abs(event.deltaX)) return
      event.preventDefault()
      zoomAt(Math.exp(-event.deltaY * 0.0025), event.clientX, event.clientY)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  })

  function spreadOf() {
    const [a, b] = [...pointers.current.values()]
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
  }
  function middle() {
    const all = [...pointers.current.values()]
    return {
      x: all.reduce((sum, p) => sum + p.x, 0) / all.length,
      y: all.reduce((sum, p) => sum + p.y, 0) / all.length,
    }
  }

  function down(event: ReactPointerEvent<SVGSVGElement>) {
    lastPointer.current = event.pointerType
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const centre = middle()
    gesture.current = {
      start: view,
      x: centre.x,
      y: centre.y,
      spread: spreadOf(),
      moved: gesture.current?.moved ?? false,
    }
    swallowClick.current = false
  }

  function move(event: ReactPointerEvent<SVGSVGElement>) {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const g = gesture.current
    const centre = middle()
    if (
      !g.moved &&
      Math.hypot(centre.x - g.x, centre.y - g.y) < DRAG_SLOP &&
      pointers.current.size < 2
    )
      return
    // One finger only drags a zoomed-in map; zoomed out, it is the page's.
    if (pointers.current.size < 2 && g.start.scale === 1) return
    g.moved = true
    if (event.pointerType !== 'mouse') event.currentTarget.setPointerCapture(event.pointerId)
    const box = svg.current!.getBoundingClientRect()
    let scale = g.start.scale
    if (pointers.current.size >= 2 && g.spread > 0) scale = g.start.scale * (spreadOf() / g.spread)
    scale = Math.min(MOST, Math.max(1, scale))
    // Keep the drawing point that began under the fingers under them.
    const anchor = toDrawing(g.x, g.y, g.start)
    const fit = Math.min(box.width / (base.width / scale), box.height / (base.height / scale))
    setView(
      clamp(
        {
          scale,
          x: anchor.x - (centre.x - box.left - box.width / 2) / fit,
          y: anchor.y - (centre.y - box.top - box.height / 2) / fit,
        },
        base,
      ),
    )
  }

  function up(event: ReactPointerEvent<SVGSVGElement>) {
    pointers.current.delete(event.pointerId)
    const g = gesture.current
    if (g?.moved) swallowClick.current = true
    if (pointers.current.size === 0) {
      gesture.current = null
      // A quick second tap zooms in on that spot.
      if (!g?.moved && event.pointerType !== 'mouse') {
        const now = event.timeStamp
        if (now - lastTap.current < 300) {
          zoomAt(2, event.clientX, event.clientY)
          lastTap.current = 0
        } else lastTap.current = now
      }
    } else {
      // A finger lifted mid-pinch: carry on from here with the rest.
      const centre = middle()
      gesture.current = { start: view, x: centre.x, y: centre.y, spread: spreadOf(), moved: true }
    }
  }

  const zoomed = view.scale > 1.01
  const button =
    'flex size-10 items-center justify-center rounded-full bg-paper/95 text-ink shadow-card ring-1 ring-line transition hover:bg-oat active:scale-95 disabled:opacity-40'

  return (
    <div className="relative">
      <svg
        ref={svg}
        viewBox={shown}
        role="group"
        aria-label={label}
        className={cn(className, zoomed ? 'touch-none' : 'touch-pan-y', 'select-none')}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={onPointerLeave}
        onDoubleClick={(event) => {
          // Fingers have their own double tap (in `up`); this is the mouse's.
          if (lastPointer.current === 'mouse') zoomAt(2, event.clientX, event.clientY)
        }}
        onClickCapture={(event) => {
          // The end of a drag or pinch isn't a tap on whatever it ended over.
          if (swallowClick.current) {
            event.stopPropagation()
            event.preventDefault()
            swallowClick.current = false
          }
        }}
      >
        {children}
      </svg>
      <div className="absolute right-2 bottom-2 flex flex-col gap-1.5">
        <button
          type="button"
          aria-label="Zoom in"
          className={button}
          disabled={view.scale >= MOST}
          onClick={() => zoomAt(2)}
        >
          <Plus className="size-5" />
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          className={button}
          disabled={!zoomed}
          onClick={() => zoomAt(0.5)}
        >
          <Minus className="size-5" />
        </button>
        {zoomed && (
          <button
            type="button"
            aria-label="Show the whole map"
            className={button}
            onClick={() => setView(whole)}
          >
            <Maximize2 className="size-4" />
          </button>
        )}
      </div>
    </div>
  )
}
