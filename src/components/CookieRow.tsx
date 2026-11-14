import { Link } from 'react-router'
import { formatDate, formatPlace } from '@/lib/format'
import type { OverallPrecision } from '@/lib/rubric'
import type { RatedCookie } from '@/lib/stats'
import { CookiePhoto } from './CookiePhoto'
import { Medallion } from './Score'

interface Props {
  cookie: RatedCookie
  precision: OverallPrecision
  /** Small label above the cookie's name, e.g. "Best taste". */
  eyebrow?: string
  /** Replaces the default "bakery · place" line. */
  detail?: string
}

/** A compact, tappable line for lists of cookies. */
export function CookieRow({ cookie, precision, eyebrow, detail }: Props) {
  return (
    <Link
      to={`/cookie/${cookie.id}`}
      className="flex items-center gap-3 rounded-2xl p-1.5 transition hover:bg-oat active:scale-[0.99]"
    >
      <CookiePhoto cookie={cookie} className="size-14 shrink-0 rounded-xl" />
      <span className="min-w-0 flex-1">
        {eyebrow && (
          <span className="block text-[11px] font-bold tracking-[0.1em] text-crust uppercase">
            {eyebrow}
          </span>
        )}
        <span className="block truncate font-display text-[17px] leading-snug font-semibold">
          {cookie.cookieType}
        </span>
        <span className="block truncate text-[13px] text-ink-soft">
          {detail ??
            `${cookie.bakery} · ${formatPlace(cookie)} · ${formatDate(cookie.eatenOn, 'short')}`}
        </span>
      </span>
      <Medallion value={cookie.overall} precision={precision} size="sm" />
    </Link>
  )
}
