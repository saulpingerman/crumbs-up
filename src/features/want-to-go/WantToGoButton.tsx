import { Heart } from 'lucide-react'
import { cn } from '@/lib/cn'
import { addWantToGo, removeWantToGo, useIsWanted, type Wantable } from '@/lib/want-to-go'

/** Save a bakery to the Want to go list, or take it off again. */
export function WantToGoButton({ place }: { place: Wantable }) {
  const wanted = useIsWanted(place.id)
  return (
    <button
      type="button"
      aria-pressed={wanted ?? false}
      disabled={wanted === undefined}
      onClick={() => void (wanted ? removeWantToGo(place.id) : addWantToGo(place))}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition active:scale-95',
        wanted
          ? 'border-transparent bg-taste-soft text-taste-ink'
          : 'border-line bg-paper text-ink hover:bg-oat',
      )}
    >
      <Heart className={cn('size-4', wanted && 'fill-current')} aria-hidden />
      Want to go
    </button>
  )
}
