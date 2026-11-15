import { Plus } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/Button'
import { Segmented, Select } from '@/components/Field'
import { Card, Page } from '@/components/Page'
import { Medallion } from '@/components/Score'
import { categoryText } from '@/components/category-styles'
import {
  communityTownLabel,
  communityTowns,
  inTown,
  rankBakeries,
  rankCookies,
  rankTypes,
  reweigh,
  sameCookie,
  type CommunityCookie,
} from '@/lib/community'
import { cn } from '@/lib/cn'
import { formatAverage, plural } from '@/lib/format'
import { CATEGORIES, CATEGORY_META, formatScore, type RankBy, type Scores } from '@/lib/rubric'
import { useSettings, weightsFor } from '@/lib/settings'
import { RankByChips } from '@/components/RankBy'
import { useCommunity } from '@/lib/use-community'
import { useCookies } from '@/lib/use-cookies'
import { DiscoverTabs } from './DiscoverTabs'

type View = 'cookies' | 'bakeries' | 'types'

/** How many rows a list starts with; the rest are a tap away. */
const FIRST_PAGE = 25

/** Everyone's ratings on Crumbs Up, added up: the best cookies, bakeries and kinds. */
export function TopRatedPage() {
  const community = useCommunity()
  const mine = useCookies()
  const settings = useSettings()
  const { overallPrecision } = settings
  const [view, setView] = useState<View>('cookies')
  const [rankBy, setRankBy] = useState<RankBy>('overall')
  const [chosenTown, setTown] = useState('')
  const [showing, setShowing] = useState(FIRST_PAGE)

  // The overall is worked out the way this person weighs the three, as in
  // their own journal.
  const weights = weightsFor(settings)
  const all = useMemo(
    () => (community.status === 'ready' ? reweigh(community.cookies, weights) : null),
    [community, weights],
  )
  const towns = useMemo(() => (all ? communityTowns(all) : []), [all])
  const town = towns.some((t) => t.key === chosenTown) ? chosenTown : ''
  const here = useMemo(() => (all ? inTown(all, town) : []), [all, town])

  const cookies = useMemo(() => rankCookies(here, rankBy), [here, rankBy])
  const bakeries = useMemo(() => rankBakeries(here, rankBy), [here, rankBy])
  const types = useMemo(() => rankTypes(here, rankBy), [here, rankBy])
  const count = { cookies: cookies.length, bakeries: bakeries.length, types: types.length }[view]

  return (
    <Page title="Top rated" lede="Everyone’s ratings, added up." action={<DiscoverTabs />}>
      {community.status === 'loading' && (
        <ul aria-busy className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="h-[84px] animate-pulse rounded-3xl bg-oat" />
          ))}
        </ul>
      )}

      {community.status === 'off' && (
        <Notice title="Top rated isn’t switched on yet">
          It needs one more piece of setup on the server.
        </Notice>
      )}

      {community.status === 'failed' && (
        <Notice title="Couldn’t load the ratings">
          Check your connection and try again.
          <Button className="mt-4" variant="secondary" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </Notice>
      )}

      {all && all.length === 0 && (
        <Notice title="No ratings yet">Sign in and rate a cookie, and it starts the list.</Notice>
      )}

      {all && all.length > 0 && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Segmented<View>
              label="Rank by"
              value={view}
              onChange={(next) => {
                setView(next)
                setShowing(FIRST_PAGE)
              }}
              options={[
                { value: 'cookies', label: 'Cookies' },
                { value: 'bakeries', label: 'Bakeries' },
                { value: 'types', label: 'Types' },
              ]}
            />
            {towns.length > 1 && (
              <div className="w-44">
                <Select
                  aria-label="Town"
                  value={town}
                  onChange={(e) => {
                    setTown(e.target.value)
                    setShowing(FIRST_PAGE)
                  }}
                  className="h-11 rounded-full"
                >
                  <option value="">Everywhere</option>
                  {towns.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <RankByChips
              value={rankBy}
              onChange={(next) => {
                setRankBy(next)
                setShowing(FIRST_PAGE)
              }}
              className="w-full"
            />
          </div>

          <ol className="space-y-2">
            {view === 'cookies' &&
              cookies.slice(0, showing).map((cookie, i) => {
                const yours = mine?.find((c) => sameCookie(cookie, c))
                return (
                  <Row
                    key={`${cookie.cookieType}|${cookie.bakery}|${cookie.city}|${cookie.state}`}
                    rank={i + 1}
                    title={cookie.cookieType}
                    detail={[cookie.bakery, communityTownLabel(cookie)].filter(Boolean).join(' · ')}
                    scores={cookie.scores}
                    overall={cookie.overall}
                    count={plural(cookie.raters, 'person', 'people')}
                    action={
                      yours ? (
                        <Link to={`/cookie/${yours.id}`} className={chip}>
                          You gave it {formatScore(yours.overall, overallPrecision)}
                        </Link>
                      ) : (
                        <Link to={rateLink(cookie)} className={chip}>
                          <Plus className="size-3.5" strokeWidth={2.6} />
                          Rate it
                        </Link>
                      )
                    }
                  />
                )
              })}
            {view === 'bakeries' &&
              bakeries
                .slice(0, showing)
                .map((bakery, i) => (
                  <Row
                    key={bakery.key}
                    rank={i + 1}
                    title={bakery.name}
                    detail={[
                      bakery.place,
                      bakery.cookies > 1
                        ? `best: ${bakery.best.cookieType}`
                        : bakery.best.cookieType,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    scores={bakery.scores}
                    overall={bakery.overall}
                    count={`${plural(bakery.ratings, 'rating')}${bakery.cookies > 1 ? ` of ${bakery.cookies} cookies` : ''}`}
                  />
                ))}
            {view === 'types' &&
              types
                .slice(0, showing)
                .map((type, i) => (
                  <Row
                    key={type.key}
                    rank={i + 1}
                    title={type.name}
                    detail={`best at ${type.best.bakery}`}
                    scores={type.scores}
                    overall={type.overall}
                    count={`${plural(type.ratings, 'rating')}${type.cookies > 1 ? ` at ${type.cookies} bakeries` : ''}`}
                  />
                ))}
          </ol>

          {count > showing && (
            <Button
              variant="secondary"
              className="mt-4 w-full"
              onClick={() => setShowing((n) => n + FIRST_PAGE)}
            >
              Show more
            </Button>
          )}
        </>
      )}
    </Page>
  )
}

const chip =
  'inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-oat px-3 text-[13px] font-semibold text-ink transition hover:bg-line'

function rateLink(cookie: CommunityCookie): string {
  const params = new URLSearchParams({ type: cookie.cookieType, bakery: cookie.bakery })
  if (cookie.city) params.set('city', cookie.city)
  if (cookie.state) params.set('state', cookie.state)
  return `/rate?${params}`
}

function Row({
  rank,
  title,
  detail,
  scores,
  overall,
  count,
  action,
}: {
  rank: number
  title: string
  detail: string
  scores: Scores
  overall: number
  count: string
  action?: ReactNode
}) {
  return (
    <li className="flex items-center gap-3 rounded-3xl border border-line bg-paper p-3.5 shadow-card">
      <span
        aria-hidden
        className="numerals w-6 shrink-0 text-center text-lg font-semibold text-ink-faint"
      >
        {rank}
      </span>
      <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        <h2 className="font-display text-[18px] leading-tight font-semibold">{title}</h2>
        <p className="text-sm text-ink-soft">{detail}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
          <span className="flex gap-2.5">
            {CATEGORIES.map((category) => (
              <span key={category} className="whitespace-nowrap">
                <span className="text-ink-soft">{CATEGORY_META[category].label} </span>
                <span className={cn('numerals font-semibold', categoryText[category])}>
                  {formatAverage(scores[category])}
                </span>
              </span>
            ))}
          </span>
          <span className="text-ink-faint">{count}</span>
          {action}
        </div>
      </div>
      <Medallion
        value={formatAverage(overall).replace(/\.0$/, '')}
        size="sm"
        label={`Average score ${formatAverage(overall)} out of 10`}
      />
    </li>
  )
}

function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="text-center">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <div className="mt-1 text-[15px] text-ink-soft">{children}</div>
    </Card>
  )
}
