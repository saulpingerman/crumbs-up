import { MapPin, Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/Button'
import { CookieRow } from '@/components/CookieRow'
import { Select } from '@/components/Field'
import { Card, SectionTitle } from '@/components/Page'
import { Medallion } from '@/components/Score'
import { bakeryPlaces, type BakeryPlace } from '@/lib/bakery-places'
import { cn } from '@/lib/cn'
import { rankCookies, sameCookie, type CommunityCookie } from '@/lib/community'
import { isInCounty, loadCounties, type County, type CountyAtlas } from '@/lib/counties'
import { formatAverage, plural } from '@/lib/format'
import { lean } from '@/lib/geo'
import { loadPlaces, type PlaceIndex } from '@/lib/places'
import { useSettings } from '@/lib/settings'
import { stateName, US_STATES } from '@/lib/states'
import { byScoreDesc, mean, type RatedCookie } from '@/lib/stats'
import { useCommunity } from '@/lib/use-community'
import { BandLegend } from './BandLegend'
import { bandColor } from './bands'
import { OpenInMaps } from './OpenInMaps'
import { notYetRated, promise, rateLink } from './suggest'
import { useCountyBakeries } from './use-county-bakeries'

interface Standing {
  county: County
  cookies: RatedCookie[]
  average: number
}

/** How many bakeries a county's suggestions start with. */
const FIRST_FEW = 6

/**
 * One state at a time, county by county, shaded by how good the cookies
 * there have been. Tap any county for what you've rated there and where to
 * go next. The map itself works offline: the towns and the county lines
 * both come with the app.
 */
export function CountiesView({ cookies }: { cookies: RatedCookie[] }) {
  const settings = useSettings()
  const [atlas, setAtlas] = useState<CountyAtlas | null>(null)
  const [towns, setTowns] = useState<PlaceIndex | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    void loadCounties().then(setAtlas, () => setFailed(true))
    void loadPlaces().then(setTowns, () => setFailed(true))
  }, [])
  const [chosenState, setState] = useState('')
  const [chosenCounty, setCounty] = useState('')

  const mine = useMemo(() => (towns ? bakeryPlaces(cookies, towns) : []), [cookies, towns])

  // Every cookie that can be put on the map, filed under the county it is in.
  const { standings, lost } = useMemo(() => {
    const byCounty = new Map<string, Standing>()
    let lost = 0
    if (!atlas) return { standings: byCounty, lost }
    for (const place of mine) {
      const county = place.position ? atlas.at(place.position, place.state) : null
      if (!county) {
        lost += place.cookies.length
        continue
      }
      const standing = byCounty.get(county.fips)
      if (standing) standing.cookies.push(...place.cookies)
      else byCounty.set(county.fips, { county, cookies: [...place.cookies], average: 0 })
    }
    for (const standing of byCounty.values()) {
      standing.cookies.sort(byScoreDesc)
      standing.average = mean(standing.cookies.map((c) => c.overall))
    }
    return { standings: byCounty, lost }
  }, [atlas, mine])

  // The states with cookies in them, busiest first. Any other state can be
  // opened too, to see where to go there.
  const visited = useMemo(() => {
    const counts = new Map<string, number>()
    for (const { county, cookies: list } of standings.values()) {
      counts.set(county.state, (counts.get(county.state) ?? 0) + list.length)
    }
    return [...counts]
      .sort(([a, n], [b, m]) => m - n || stateName(a).localeCompare(stateName(b)))
      .map(([code]) => code)
  }, [standings])
  const state = chosenState || visited[0] || settings.lastState || ''

  const counties = useMemo(() => atlas?.in(state) ?? [], [atlas, state])
  const ledger = useMemo(
    () =>
      [...standings.values()]
        .filter((s) => s.county.state === state)
        .sort((a, b) => b.average - a.average || b.cookies.length - a.cookies.length),
    [standings, state],
  )
  // The county on show: the one tapped, or else the best of this state's.
  const county = counties.find((c) => c.fips === chosenCounty) ?? ledger[0]?.county ?? null
  const standing = county ? standings.get(county.fips) : undefined

  // Fit the drawing to the state, with a little air round it — and stand the
  // state upright. The country's map is drawn on a cone, which leaves states
  // away from its middle leaning; on its own, a state should have north at the top.
  const frame = useMemo(() => {
    if (counties.length === 0) return { viewBox: '0 0 975 610', turn: '' }
    const left = Math.min(...counties.map((c) => c.box[0]))
    const top = Math.min(...counties.map((c) => c.box[1]))
    const right = Math.max(...counties.map((c) => c.box[2]))
    const bottom = Math.max(...counties.map((c) => c.box[3]))
    const cx = (left + right) / 2
    const cy = (top + bottom) / 2
    const degrees = -lean([cx, cy])
    const angle = (degrees * Math.PI) / 180
    // Where every county's corners land once turned says how much room is needed.
    const turned = counties.flatMap(({ box: [l, t, r, b] }) =>
      [
        [l, t],
        [r, t],
        [r, b],
        [l, b],
      ].map(([x, y]) => [
        cx + (x! - cx) * Math.cos(angle) - (y! - cy) * Math.sin(angle),
        cy + (x! - cx) * Math.sin(angle) + (y! - cy) * Math.cos(angle),
      ]),
    )
    const xs = turned.map(([x]) => x!)
    const ys = turned.map(([, y]) => y!)
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    const air = Math.max(x1 - x0, y1 - y0) * 0.03
    return {
      viewBox: `${x0 - air} ${y0 - air} ${x1 - x0 + air * 2} ${y1 - y0 + air * 2}`,
      turn: `rotate(${degrees} ${cx} ${cy})`,
    }
  }, [counties])

  if (failed) {
    return (
      <Card className="text-center text-[15px] text-ink-soft">
        The county map couldn’t load. Check your connection and try again.
      </Card>
    )
  }
  if (!atlas || !towns) return <div aria-busy className="h-80 animate-pulse rounded-3xl bg-oat" />

  const others = US_STATES.filter((s) => !visited.includes(s.code))

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
      <Card className="p-3 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
          <div className="w-52">
            <Select
              aria-label="State"
              value={state}
              onChange={(e) => {
                setState(e.target.value)
                setCounty('')
              }}
              className="h-11 rounded-full"
            >
              {!state && <option value="">Pick a state</option>}
              {visited.length > 0 && (
                <optgroup label="Where you’ve rated">
                  {visited.map((code) => (
                    <option key={code} value={code}>
                      {stateName(code)}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label={visited.length > 0 ? 'Everywhere else' : 'States'}>
                {others.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            </Select>
          </div>
          {counties.length > 0 && (
            <p className="text-sm text-ink-soft">
              {ledger.length} of {plural(counties.length, 'county', 'counties')}
            </p>
          )}
        </div>
        {counties.length > 0 && (
          <>
            <svg
              viewBox={frame.viewBox}
              role="group"
              aria-label={`Map of ${stateName(state)} by county, shaded by average cookie score`}
              className="max-h-[60dvh] w-full"
            >
              <g transform={frame.turn}>
                {counties.map((each) => {
                  const rated = standings.get(each.fips)
                  return (
                    <path
                      key={each.fips}
                      d={each.d}
                      fill={rated ? bandColor(rated.average) : 'var(--oat)'}
                      stroke="var(--paper)"
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                      strokeLinejoin="round"
                      role="button"
                      tabIndex={0}
                      aria-label={
                        rated
                          ? `${each.name}: ${plural(rated.cookies.length, 'cookie')}, average ${formatAverage(rated.average)}`
                          : `${each.name}: no cookies yet`
                      }
                      aria-pressed={county?.fips === each.fips}
                      className="cursor-pointer outline-none hover:brightness-95 focus-visible:brightness-90"
                      onClick={() => setCounty(each.fips)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setCounty(each.fips)
                        }
                      }}
                    >
                      <title>{each.name}</title>
                    </path>
                  )
                })}
                {/* Outline the chosen county on top so no neighbour covers it. */}
                {county && (
                  <path
                    d={county.d}
                    fill="none"
                    stroke="var(--ink)"
                    strokeWidth={2.5}
                    vectorEffect="non-scaling-stroke"
                    strokeLinejoin="round"
                    pointerEvents="none"
                  />
                )}
              </g>
            </svg>
            <BandLegend />
          </>
        )}
        {lost > 0 && (
          <p className="mt-3 px-1 text-xs text-ink-faint">
            {plural(lost, 'cookie')} couldn’t be placed: no town the map knows.
          </p>
        )}
      </Card>

      <div className="min-w-0 space-y-5">
        {county ? (
          <Card>
            <p className="text-xs font-bold tracking-[0.14em] text-crust uppercase">
              {standing
                ? `${plural(standing.cookies.length, 'cookie')} · average ${formatAverage(standing.average)}`
                : 'No cookies yet'}
            </p>
            <SectionTitle className="mt-1 text-2xl">{county.name}</SectionTitle>
            {standing && (
              <ul className="-mx-1.5 mt-3">
                {standing.cookies.map((cookie) => (
                  <li key={cookie.id}>
                    <CookieRow cookie={cookie} precision={settings.overallPrecision} />
                  </li>
                ))}
              </ul>
            )}
            <PlacesToTry
              // A fresh list, back at its first few, for each county.
              key={county.fips}
              county={county}
              cookies={cookies}
              mine={mine}
              towns={towns}
              online={settings.onlinePlaces}
            />
          </Card>
        ) : (
          counties.length > 0 && (
            <Card className="text-center text-[15px] text-ink-soft">
              Tap a county to see where to try there.
            </Card>
          )
        )}

        {ledger.length > 1 && (
          <Card>
            <SectionTitle>County standings</SectionTitle>
            <ol className="mt-3 divide-y divide-line/70">
              {ledger.map((each, i) => (
                <li key={each.county.fips}>
                  <button
                    type="button"
                    onClick={() => setCounty(each.county.fips)}
                    aria-pressed={county?.fips === each.county.fips}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-1 py-2.5 text-left transition hover:bg-oat',
                      county?.fips === each.county.fips && 'font-semibold',
                    )}
                  >
                    <span className="numerals w-6 text-sm text-ink-faint">{i + 1}</span>
                    <span
                      aria-hidden
                      className="size-3 shrink-0 rounded-[4px]"
                      style={{ background: bandColor(each.average) }}
                    />
                    <span className="min-w-0 flex-1 truncate">{each.county.name}</span>
                    <span className="text-sm text-ink-soft">
                      {plural(each.cookies.length, 'cookie')}
                    </span>
                    <span className="numerals w-9 text-right text-lg font-semibold">
                      {formatAverage(each.average)}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </Card>
        )}
      </div>
    </div>
  )
}

/**
 * Where to go in a county: what other people have rated highest there, and
 * the bakeries on the map that aren't in the journal yet.
 */
function PlacesToTry({
  county,
  cookies,
  mine,
  towns,
  online,
}: {
  county: County
  cookies: RatedCookie[]
  mine: BakeryPlace[]
  towns: PlaceIndex
  online: boolean
}) {
  const [showAll, setShowAll] = useState(false)
  const bakeries = useCountyBakeries(county, online)
  const community = useCommunity()

  // Other people's favourites in this county that aren't in the journal.
  const favourites = useMemo<CommunityCookie[]>(() => {
    if (community.status !== 'ready') return []
    const here = community.cookies.filter((cookie) => {
      if (cookie.state !== county.state) return false
      const town = towns.find(cookie.city, cookie.state)
      return town ? isInCounty(town, county) : false
    })
    return rankCookies(here)
      .filter((cookie) => !cookies.some((own) => sameCookie(cookie, own)))
      .slice(0, 3)
  }, [community, county, towns, cookies])

  // Bakeries to try: a cookie shop before a doughnut shop, then by name.
  const untried = useMemo(
    () =>
      bakeries.status === 'ready'
        ? notYetRated(bakeries.places, mine).sort(
            (a, b) => promise(b.name) - promise(a.name) || a.name.localeCompare(b.name),
          )
        : [],
    [bakeries, mine],
  )
  const shown = showAll ? untried : untried.slice(0, FIRST_FEW)
  const nothing = favourites.length === 0 && untried.length === 0

  return (
    <section className="mt-4 border-t border-line/70 pt-4">
      <h3 className="font-display text-lg font-semibold">Places to try</h3>

      {favourites.length > 0 && (
        <ul className="mt-2 space-y-2">
          {favourites.map((cookie) => (
            <li
              key={`${cookie.cookieType}|${cookie.bakery}`}
              className="flex items-center gap-3 rounded-2xl bg-oat/60 px-3 py-2.5"
            >
              <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                <p className="font-semibold">{cookie.cookieType}</p>
                <p className="text-sm text-ink-soft">
                  {cookie.bakery} · rated by {plural(cookie.raters, 'person', 'people')}
                </p>
                <Link
                  to={rateLink(cookie.bakery, cookie.city, cookie.state)}
                  className="mt-1 inline-flex items-center gap-1 text-[13px] font-semibold underline underline-offset-2"
                >
                  <Plus className="size-3.5" strokeWidth={2.6} />
                  Rate it
                </Link>
              </div>
              <Medallion
                value={formatAverage(cookie.overall).replace(/\.0$/, '')}
                size="sm"
                label={`Average score ${formatAverage(cookie.overall)} out of 10`}
              />
            </li>
          ))}
        </ul>
      )}

      {bakeries.status === 'looking' && (
        <p role="status" className="mt-2 text-sm text-ink-soft">
          Looking for bakeries…
        </p>
      )}
      {bakeries.status === 'failed' && (
        <p role="status" className="mt-2 text-sm text-ink-soft">
          Couldn’t look for bakeries just now.
        </p>
      )}
      {bakeries.status === 'ready' && nothing && (
        <p role="status" className="mt-2 text-sm text-ink-soft">
          No bakeries listed here that you haven’t tried.
        </p>
      )}
      {!online && nothing && (
        <p className="mt-2 text-sm text-ink-soft">
          Looking up bakeries is switched off in Settings.
        </p>
      )}

      {shown.length > 0 && (
        <ul className="mt-2 divide-y divide-line/70">
          {shown.map((place) => (
            <li key={place.id} className="py-3">
              <p className="font-semibold [overflow-wrap:anywhere]">{place.name}</p>
              <p className="flex items-center gap-1.5 text-sm text-ink-soft">
                <MapPin className="size-3.5 shrink-0" aria-hidden />
                {[place.street, place.city].filter(Boolean).join(', ') || 'Address not listed'}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Link
                  to={rateLink(place.name, place.city, place.state, place)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-cocoa px-3.5 text-sm font-semibold text-on-cocoa transition active:scale-95"
                >
                  <Plus className="size-4" strokeWidth={2.6} />
                  Rate here
                </Link>
                <OpenInMaps bakery={place.name} city={place.city} state={place.state} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {untried.length > shown.length && (
        <Button variant="secondary" className="mt-1 w-full" onClick={() => setShowAll(true)}>
          Show all {untried.length}
        </Button>
      )}
      {untried.length > 0 && (
        <p className="mt-3 text-xs text-ink-faint">
          Places © OpenStreetMap contributors. It lists bakeries, not whether they sell cookies.
        </p>
      )}
    </section>
  )
}
