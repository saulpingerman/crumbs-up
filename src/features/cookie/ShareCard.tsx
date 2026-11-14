import type { Ref } from 'react'
import { LogoMark } from '@/components/Logo'
import { PhotoPlaceholder } from '@/components/CookiePhoto'
import { Medallion } from '@/components/Score'
import { categoryInkVar } from '@/components/category-styles'
import { formatDate, formatPlace } from '@/lib/format'
import {
  CATEGORIES,
  CATEGORY_META,
  formatScore,
  tierFor,
  type OverallPrecision,
} from '@/lib/rubric'
import type { RatedCookie } from '@/lib/stats'

export const SHARE_WIDTH = 1080
export const SHARE_HEIGHT = 1350

interface Props {
  cookie: RatedCookie
  photoUrl: string | null
  precision: OverallPrecision
  ref?: Ref<HTMLDivElement>
}

/**
 * A 4:5 scorecard sized for social feeds. It is laid out in fixed pixels
 * and always in the light theme, so the exported image is identical no
 * matter what device or theme produced it.
 */
export function ShareCard({ cookie, photoUrl, precision, ref }: Props) {
  const tier = tierFor(cookie.overall)
  return (
    <div
      ref={ref}
      className="theme-light flex flex-col bg-cream font-sans text-ink"
      style={{ width: SHARE_WIDTH, height: SHARE_HEIGHT }}
    >
      <div className="relative" style={{ height: 760 }}>
        {photoUrl ? (
          <img src={photoUrl} alt="" className="size-full object-cover" />
        ) : (
          <PhotoPlaceholder />
        )}
        <Medallion
          value={cookie.overall}
          precision={precision}
          size="xl"
          // Sized in pixels: the card is rendered at a fixed 1080×1350.
          className="absolute right-14 -bottom-[120px] size-[280px] text-[124px]"
        />
      </div>

      <div className="flex flex-1 flex-col px-16 pt-12 pb-12">
        <p className="text-[26px] font-bold tracking-[0.16em] text-crust uppercase">{tier.name}</p>
        <h1
          className="mt-2 font-display font-semibold"
          style={{
            fontSize: cookie.cookieType.length > 22 ? 64 : 80,
            lineHeight: 1.02,
            maxWidth: 680,
          }}
        >
          {cookie.cookieType}
        </h1>
        <p className="mt-4 text-[34px] leading-tight font-semibold">{cookie.bakery}</p>
        <p className="mt-1 text-[28px] text-ink-soft">
          {formatPlace(cookie)} · {formatDate(cookie.eatenOn, 'long')}
        </p>

        <div className="mt-auto flex items-end justify-between">
          <div className="flex">
            {CATEGORIES.map((c) => (
              <div key={c} className="w-[196px]">
                <p
                  className="numerals text-[72px] leading-none font-semibold"
                  style={{ color: categoryInkVar[c] }}
                >
                  {formatScore(cookie.scores[c])}
                </p>
                <p className="mt-2 text-[22px] font-bold tracking-[0.12em] text-ink-soft uppercase">
                  {CATEGORY_META[c].label}
                </p>
              </div>
            ))}
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="flex items-center gap-3">
              <LogoMark className="size-12" />
              <span className="font-display text-[38px] leading-none font-semibold">Crumbs Up</span>
            </span>
            <span className="text-[19px] font-medium text-ink-faint">
              5 = a standard Toll House cookie
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
