import { useEffect, useMemo, useState } from 'react'
import { CookieRow } from '@/components/CookieRow'
import { Select } from '@/components/Field'
import { Card, SectionTitle } from '@/components/Page'
import { bakeryPlaces } from '@/lib/bakery-places'
import { cn } from '@/lib/cn'
import { loadCounties, type County, type CountyAtlas } from '@/lib/counties'
import { formatAverage, plural } from '@/lib/format'
import { lean } from '@/lib/geo'
import { loadPlaces, type PlaceIndex } from '@/lib/places'
import { useSettings } from '@/lib/settings'
import { stateName } from '@/lib/states'
import { byScoreDesc, mean, type RatedCookie } from '@/lib/stats'
import { BandLegend } from './BandLegend'
import { bandColor } from './bands'

interface Standing {
  county: County
  cookies: RatedCookie[]
  average: number
}

/**
 * One state at a time, county by county, shaded by how good the cookies
 * there have been. Works offline: the towns and the county lines both come
 * with the app.
 */
export function CountiesView({ cookies }: { cookies: RatedCookie[] }) {
  const { overallPrecision } = useSettings()
  const [atlas, setAtlas] = useState<CountyAtlas | null>(null)
  const [towns, setTowns] = useState<PlaceIndex | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    void loadCounties().then(setAtlas, () => setFailed(true))
    void loadPlaces().then(setTowns, () => setFailed(true))
  }, [])
  const [chosenState, setState] = useState('')
  const [chosenCounty, setCounty] = useState('')

  // Every cookie that can be put on the map, filed under the county it is in.
  const { standings, lost } = useMemo(() => {
    const byCounty = new Map<string, Standing>()
    let lost = 0
    if (!atlas || !towns) return { standings: byCounty, lost }
    for (const place of bakeryPlaces(cookies, towns)) {
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
  }, [atlas, towns, cookies])

  // The states there is anything to show for, busiest first.
  const states = useMemo(() => {
    const counts = new Map<string, number>()
    for (const { county, cookies: list } of standings.values()) {
      counts.set(county.state, (counts.get(county.state) ?? 0) + list.length)
    }
    return [...counts]
      .sort(([a, n], [b, m]) => m - n || stateName(a).localeCompare(stateName(b)))
      .map(([code]) => code)
  }, [standings])
  const state = states.includes(chosenState) ? chosenState : (states[0] ?? '')

  const counties = useMemo(() => atlas?.in(state) ?? [], [atlas, state])
  const ledger = useMemo(
    () =>
      [...standings.values()]
        .filter((s) => s.county.state === state)
        .sort((a, b) => b.average - a.average || b.cookies.length - a.cookies.length),
    [standings, state],
  )
  const active = ledger.find((s) => s.county.fips === chosenCounty) ?? ledger[0]

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
  if (states.length === 0) {
    return (
      <Card className="text-center text-[15px] text-ink-soft">
        {cookies.length === 0
          ? 'Rate a cookie and its county is shaded in here.'
          : 'None of your cookies has a town the map knows yet. Add a town to one and its county is shaded in here.'}
      </Card>
    )
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
      <Card className="p-3 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
          {states.length > 1 ? (
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
                {states.map((code) => (
                  <option key={code} value={code}>
                    {stateName(code)}
                  </option>
                ))}
              </Select>
            </div>
          ) : (
            <p className="font-display text-xl font-semibold">{stateName(state)}</p>
          )}
          <p className="text-sm text-ink-soft">
            {ledger.length} of {plural(counties.length, 'county', 'counties')}
          </p>
        </div>
        <svg
          viewBox={frame.viewBox}
          role="group"
          aria-label={`Map of ${stateName(state)} by county, shaded by average cookie score`}
          className="max-h-[60dvh] w-full"
        >
          <g transform={frame.turn}>
            {counties.map((county) => {
              const standing = standings.get(county.fips)
              return (
                <path
                  key={county.fips}
                  d={county.d}
                  fill={standing ? bandColor(standing.average) : 'var(--oat)'}
                  stroke="var(--paper)"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round"
                  role={standing ? 'button' : undefined}
                  tabIndex={standing ? 0 : undefined}
                  aria-label={
                    standing
                      ? `${county.name}: ${plural(standing.cookies.length, 'cookie')}, average ${formatAverage(standing.average)}`
                      : undefined
                  }
                  aria-pressed={standing ? active?.county.fips === county.fips : undefined}
                  className={cn(
                    'outline-none',
                    standing && 'cursor-pointer hover:brightness-110 focus-visible:brightness-125',
                  )}
                  onClick={standing ? () => setCounty(county.fips) : undefined}
                  onKeyDown={(e) => {
                    if (standing && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault()
                      setCounty(county.fips)
                    }
                  }}
                >
                  <title>{county.name}</title>
                </path>
              )
            })}
            {/* Outline the chosen county on top so no neighbour covers it. */}
            {active && (
              <path
                d={active.county.d}
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
        {lost > 0 && (
          <p className="mt-3 px-1 text-xs text-ink-faint">
            {plural(lost, 'cookie')} couldn’t be placed: no town the map knows.
          </p>
        )}
      </Card>

      <div className="min-w-0 space-y-5">
        {active && (
          <Card>
            <p className="text-xs font-bold tracking-[0.14em] text-crust uppercase">
              {plural(active.cookies.length, 'cookie')} · average {formatAverage(active.average)}
            </p>
            <SectionTitle className="mt-1 text-2xl">{active.county.name}</SectionTitle>
            <ul className="-mx-1.5 mt-3">
              {active.cookies.map((cookie) => (
                <li key={cookie.id}>
                  <CookieRow cookie={cookie} precision={overallPrecision} />
                </li>
              ))}
            </ul>
          </Card>
        )}

        {ledger.length > 1 && (
          <Card>
            <SectionTitle>County standings</SectionTitle>
            <ol className="mt-3 divide-y divide-line/70">
              {ledger.map((standing, i) => (
                <li key={standing.county.fips}>
                  <button
                    type="button"
                    onClick={() => setCounty(standing.county.fips)}
                    aria-pressed={active?.county.fips === standing.county.fips}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-1 py-2.5 text-left transition hover:bg-oat',
                      active?.county.fips === standing.county.fips && 'font-semibold',
                    )}
                  >
                    <span className="numerals w-6 text-sm text-ink-faint">{i + 1}</span>
                    <span
                      aria-hidden
                      className="size-3 shrink-0 rounded-[4px]"
                      style={{ background: bandColor(standing.average) }}
                    />
                    <span className="min-w-0 flex-1 truncate">{standing.county.name}</span>
                    <span className="text-sm text-ink-soft">
                      {plural(standing.cookies.length, 'cookie')}
                    </span>
                    <span className="numerals w-9 text-right text-lg font-semibold">
                      {formatAverage(standing.average)}
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
