import { Plus, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ButtonLink } from '@/components/Button'
import { CookiePhoto } from '@/components/CookiePhoto'
import { Segmented, Select } from '@/components/Field'
import { LogoMark } from '@/components/Logo'
import { Empty, Page } from '@/components/Page'
import { Medallion } from '@/components/Score'
import { formatPlace, plural } from '@/lib/format'
import { tierFor } from '@/lib/rubric'
import { useSettings } from '@/lib/settings'
import { ELSEWHERE, stateName } from '@/lib/states'
import { byNewest, byScoreDesc, summarize, type RatedCookie } from '@/lib/stats'
import { useCookies } from '@/lib/use-cookies'
import { useTitle } from '@/lib/use-title'
import { BiteableCookie } from './BiteableCookie'
import { CookieCard } from './CookieCard'
import { BackupNudge } from './BackupNudge'

type Sort = 'recent' | 'ranked'

/**
 * How the journal was last being looked at. Opening a cookie and coming back
 * should return to the same search, state and order, not start again; a
 * fresh launch of the app does start again.
 */
const lastView: { sort: Sort; query: string; state: string } = {
  sort: 'recent',
  query: '',
  state: '',
}

export function JournalPage() {
  const cookies = useCookies()
  const { overallPrecision } = useSettings()
  const [sort, setSort] = useState<Sort>(lastView.sort)
  const [query, setQuery] = useState(lastView.query)
  const [chosenState, setState] = useState(lastView.state)
  useEffect(() => {
    Object.assign(lastView, { sort, query, state: chosenState })
  }, [sort, query, chosenState])

  const summary = useMemo(() => (cookies ? summarize(cookies) : undefined), [cookies])

  const states = useMemo(() => {
    const codes = [...new Set((cookies ?? []).map((c) => c.state))]
    return codes.sort((a, b) => stateName(a).localeCompare(stateName(b)))
  }, [cookies])
  // A remembered state whose last cookie has since gone filters nothing.
  const state = states.includes(chosenState) ? chosenState : ''

  const ranks = useMemo(() => {
    const map = new Map<string, number>()
    ;[...(cookies ?? [])].sort(byScoreDesc).forEach((c, i) => map.set(c.id, i + 1))
    return map
  }, [cookies])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (cookies ?? [])
      .filter((c) => !state || c.state === state)
      .filter(
        (c) =>
          !q ||
          [c.cookieType, c.bakery, c.city, stateName(c.state), c.notes]
            .join(' ')
            .toLowerCase()
            .includes(q),
      )
      .sort(sort === 'ranked' ? byScoreDesc : byNewest)
  }, [cookies, query, state, sort])

  if (!cookies || !summary) return null
  if (cookies.length === 0) return <FirstRun />

  const filtered = Boolean(query.trim() || state)

  return (
    <Page
      title="Cookie journal"
      lede={
        <>
          {plural(summary.count, 'cookie')} from {plural(summary.bakeries, 'bakery', 'bakeries')}{' '}
          across {plural(summary.states, 'state')}. Average score{' '}
          <strong className="font-semibold text-ink">{summary.average.toFixed(1)}</strong>.
        </>
      }
    >
      <BackupNudge />

      {summary.best && cookies.length >= 3 && !filtered && (
        <Champion cookie={summary.best} precision={overallPrecision} />
      )}

      <div className="sticky top-0 z-20 -mx-4 mb-4 flex flex-wrap items-center gap-2 bg-cream/90 px-4 py-2.5 backdrop-blur-lg sm:-mx-6 sm:px-6 md:top-16">
        <div className="relative min-w-0 flex-1 basis-52">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-faint"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search cookies, bakeries, places"
            aria-label="Search the journal"
            className="h-11 w-full rounded-full border border-line bg-paper pr-10 pl-10 placeholder:text-ink-faint focus:border-crust focus:ring-2 focus:ring-crust/25 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery('')}
              className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-ink-soft hover:bg-oat"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        {states.length > 1 && (
          <div className="w-36 shrink-0">
            <Select
              aria-label="Filter by state"
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="h-11 rounded-full"
            >
              <option value="">All states</option>
              {states.map((code) => (
                <option key={code} value={code}>
                  {code === ELSEWHERE.code ? 'Outside U.S.' : stateName(code)}
                </option>
              ))}
            </Select>
          </div>
        )}
        <Segmented
          label="Sort order"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'recent', label: 'Recent' },
            { value: 'ranked', label: 'Ranked' },
          ]}
        />
      </div>

      {visible.length === 0 ? (
        <Empty title="No matches" art={<LogoMark className="size-16 opacity-50" />}>
          Nothing in the journal fits that search.{' '}
          <button
            type="button"
            className="font-semibold text-ink underline"
            onClick={() => {
              setQuery('')
              setState('')
            }}
          >
            Clear filters
          </button>
        </Empty>
      ) : (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((cookie) => (
            <li key={cookie.id}>
              <CookieCard
                cookie={cookie}
                precision={overallPrecision}
                rank={sort === 'ranked' ? ranks.get(cookie.id) : undefined}
              />
            </li>
          ))}
        </ul>
      )}
    </Page>
  )
}

function Champion({ cookie, precision }: { cookie: RatedCookie; precision: 'half' | 'tenth' }) {
  return (
    <Link
      to={`/cookie/${cookie.id}`}
      className="group relative mb-5 block overflow-hidden rounded-3xl shadow-pop transition active:scale-[0.99]"
    >
      <CookiePhoto
        cookie={cookie}
        className="aspect-[16/11] w-full sm:aspect-[5/2] lg:aspect-[3/1]"
        imgClassName="transition-transform duration-700 ease-out-soft group-hover:scale-[1.03]"
      />
      {/* Always dark, whatever the theme: this text sits on a photograph. */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 flex items-end gap-4 p-4 text-white sm:p-6">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold tracking-[0.16em] text-butter uppercase">
            Reigning champion
          </p>
          <h2 className="mt-1 font-display text-[26px] leading-[1.08] font-semibold sm:text-4xl">
            {cookie.cookieType}
          </h2>
          <p className="mt-1 truncate text-sm text-white/85">
            {cookie.bakery} · {formatPlace(cookie)}
            <span className="hidden sm:inline"> · {tierFor(cookie.overall).name}</span>
          </p>
        </div>
        <Medallion
          value={cookie.overall}
          precision={precision}
          size="md"
          className="sm:size-24 sm:text-[40px]"
        />
      </div>
    </Link>
  )
}

function FirstRun() {
  useTitle(null)

  return (
    // On a short phone everything tightens up, so both buttons are on screen
    // without scrolling instead of hiding behind the tab bar.
    <div className="mx-auto flex max-w-xl flex-col items-center px-6 pt-10 pb-16 text-center md:pt-20 short:pt-2">
      <div className="animate-rise">
        <BiteableCookie className="size-28 short:size-20" />
      </div>
      <p className="mt-6 text-xs font-bold tracking-[0.16em] text-crust uppercase short:mt-3">
        Welcome to Crumbs Up
      </p>
      <h1 className="mt-2 font-display text-[40px] leading-[1.02] font-semibold md:text-6xl short:text-[32px]">
        Every cookie deserves a fair score.
      </h1>
      <p className="mt-4 text-[17px] leading-relaxed text-ink-soft short:hidden">
        Snap a photo, answer a few quick questions about how it looks, eats and tastes, and Crumbs
        Up works out what it should score — always measured against the same standard: a classic
        Toll House cookie is a <strong className="text-ink">5</strong>.
      </p>
      <p className="mt-3 hidden text-base leading-normal text-ink-soft short:block">
        Answer a few questions and Crumbs Up works out the score, always against one standard: a
        classic Toll House cookie is a <strong className="text-ink">5</strong>.
      </p>
      <div className="mt-8 flex flex-col items-center gap-3 short:mt-5 short:gap-1">
        <ButtonLink to="/rate" size="lg">
          <Plus className="size-5" strokeWidth={2.6} />
          Rate your first cookie
        </ButtonLink>
      </div>
      <Link
        to="/guide"
        className="mt-8 text-sm font-semibold text-ink-soft underline underline-offset-4"
      >
        How the scoring works
      </Link>
    </div>
  )
}
