import { Link } from 'react-router'
import { CookiePhoto } from '@/components/CookiePhoto'
import { Medallion, MiniScores } from '@/components/Score'
import { formatDate, formatPlace } from '@/lib/format'
import type { Category, OverallPrecision } from '@/lib/rubric'
import type { RatedCookie } from '@/lib/stats'

interface Props {
  cookie: RatedCookie
  precision: OverallPrecision
  /** 1-based position when the journal is shown as a ranking. */
  rank?: number
  /** The category the journal is ranked by, picked out on the card. */
  highlight?: Category
}

export function CookieCard({ cookie, precision, rank, highlight }: Props) {
  return (
    <Link
      to={`/cookie/${cookie.id}`}
      className="group flex h-full flex-col rounded-[22px] border border-line bg-paper p-1.5 shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-pop active:scale-[0.985]"
    >
      <div className="relative">
        <CookiePhoto
          cookie={cookie}
          className="aspect-square rounded-2xl"
          imgClassName="transition-transform duration-500 ease-out-soft group-hover:scale-[1.04]"
        />
        {rank !== undefined && (
          <span className="numerals absolute top-2 left-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-black/55 px-2 text-[13px] font-semibold text-white backdrop-blur-md">
            <span className="sr-only">Rank </span>#{rank}
          </span>
        )}
        <Medallion
          value={cookie.overall}
          precision={precision}
          size="sm"
          className="absolute right-1.5 bottom-1.5"
        />
      </div>
      <div className="min-w-0 px-2 pt-2.5 pb-2">
        <h3 className="line-clamp-2 font-display text-[17px] leading-[1.2] font-semibold break-words">
          {cookie.cookieType}
        </h3>
        <p className="mt-0.5 truncate text-[13px] text-ink-soft">{cookie.bakery}</p>
        <p className="truncate text-xs text-ink-faint">
          {formatPlace(cookie)} · {formatDate(cookie.eatenOn, 'short')}
        </p>
        <MiniScores scores={cookie.scores} highlight={highlight} className="mt-2" />
      </div>
    </Link>
  )
}
