import { useState } from 'react'
import type { CookieRecord } from '@/lib/db/schema'
import { cn } from '@/lib/cn'
import { usePhotoUrl } from '@/lib/use-photo'
import { LogoMark } from './Logo'

interface Props {
  cookie: Pick<CookieRecord, 'id' | 'hasPhoto' | 'updatedAt' | 'cookieType' | 'bakery'>
  kind?: 'thumb' | 'full'
  className?: string
  imgClassName?: string
}

/** A cookie's photo, or a quiet placeholder when there isn't one. */
export function CookiePhoto({ cookie, kind = 'thumb', className, imgClassName }: Props) {
  const url = usePhotoUrl(cookie.id, kind, cookie.updatedAt, cookie.hasPhoto)
  // While the original loads, show the thumbnail so the page never flashes empty.
  const preview = usePhotoUrl(
    cookie.id,
    'thumb',
    cookie.updatedAt,
    cookie.hasPhoto && kind === 'full',
  )
  const [loaded, setLoaded] = useState<string | null>(null)
  const src = url ?? preview

  return (
    <div className={cn('relative overflow-hidden bg-oat', className)}>
      {cookie.hasPhoto && src ? (
        <img
          src={src}
          alt={`${cookie.cookieType} cookie from ${cookie.bakery}`}
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(src)}
          className={cn(
            'size-full object-cover transition-opacity duration-300',
            loaded === src || src === preview ? 'opacity-100' : 'opacity-0',
            imgClassName,
          )}
        />
      ) : (
        <PhotoPlaceholder />
      )}
    </div>
  )
}

export function PhotoPlaceholder({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('grain flex size-full items-center justify-center bg-oat', className)}
    >
      <LogoMark className="size-2/5 max-w-28 opacity-35 saturate-50" />
    </div>
  )
}
