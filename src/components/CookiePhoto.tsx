import { cn } from '@/lib/cn'
import { useCookieImage, type ImageSource } from '@/lib/use-photo'
import { LogoMark } from './Logo'

interface Props {
  cookie: ImageSource & { bakery: string }
  kind?: 'thumb' | 'full'
  className?: string
  imgClassName?: string
}

/**
 * A cookie's picture: its photo if it has one, otherwise an illustration
 * drawn from its type and review.
 */
export function CookiePhoto({ cookie, kind = 'thumb', className, imgClassName }: Props) {
  const wanted = useCookieImage(cookie, kind)
  // While a full-size image loads, show the thumbnail so nothing flashes empty.
  const preview = useCookieImage(cookie, 'thumb', kind === 'full')
  const src = wanted.url ?? preview.url

  return (
    <div className={cn('relative overflow-hidden bg-oat', className)}>
      {src ? (
        <img
          src={src}
          alt={
            wanted.illustrated
              ? `Illustration of a ${cookie.cookieType} cookie`
              : `${cookie.cookieType} cookie from ${cookie.bakery}`
          }
          decoding="async"
          draggable={false}
          className={cn('size-full animate-fade object-cover', imgClassName)}
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
