import { geoPath } from 'd3-geo'
import { useEffect, useMemo, useRef, useState } from 'react'
import { feature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import usAtlas from 'us-atlas/states-albers-10m.json'
import { CookieRow } from '@/components/CookieRow'
import { Card, SectionTitle } from '@/components/Page'
import { bakeryPlaces } from '@/lib/bakery-places'
import { cn } from '@/lib/cn'
import { rankCookies, sameCookie } from '@/lib/community'
import { plural } from '@/lib/format'
import { worldBounds } from '@/lib/geo'
import { cookieShopsWithin } from '@/lib/osm'
import { loadPlaces, type PlaceIndex } from '@/lib/places'
import { useSettings } from '@/lib/settings'
import { stateByFips, stateName, US_STATES } from '@/lib/states'
import { byAverageDesc, groupByState, type Group, type RatedCookie } from '@/lib/stats'
import { bigTownsToTry } from '@/lib/towns'
import { useCommunity } from '@/lib/use-community'
import { BandLegend } from './BandLegend'
import { bandOf } from './bands'
import { PlacesToTry } from './PlacesToTry'
import { foldChains, notYetRated } from './suggest'
import { usePlacesLookup } from './use-places-lookup'

/** us-atlas ships pre-projected (Albers USA) shapes in a 975×610 box. */
const WIDTH = 975
const HEIGHT = 610

const SHAPES = (() => {
  const topology = usAtlas as unknown as Topology<{ states: GeometryCollection }>
  const path = geoPath()
  return feature(topology, topology.objects.states)
    .features.map((f) => {
      const state = stateByFips(String(f.id))
      const [x, y] = path.centroid(f)
      const [[left, top], [right, bottom]] = path.bounds(f)
      const box: [number, number, number, number] = [left, top, right, bottom]
      return state ? { state, d: path(f) ?? '', x, y, box } : null
    })
    .filter((s) => s !== null)
})()

interface Props {
  cookies: RatedCookie[]
}

/**
 * The country shaded by how good each state's cookies have been. Tap any
 * state for what you've rated there and where to go next. The map itself
 * works offline.
 */
export function StatesView({ cookies }: Props) {
  const { overallPrecision, onlinePlaces } = useSettings()
  const [selected, setSelected] = useState<string | null>(null)
  const [hover, setHover] = useState<{ code: string; x: number; y: number } | null>(null)
  const frame = useRef<HTMLDivElement>(null)

  const groups = useMemo(() => {
    const map = new Map<string, Group>()
    for (const g of groupByState(cookies)) map.set(g.key, g)
    return map
  }, [cookies])

  const ledger = useMemo(
    () =>
      [...groups.values()]
        .filter((g) => US_STATES.some((s) => s.code === g.key))
        .sort(byAverageDesc),
    [groups],
  )

  // The state on show: the one tapped, or else the best of them.
  const activeCode = selected ?? ledger[0]?.key ?? null
  const active = activeCode ? groups.get(activeCode) : undefined
  const hovered = hover ? groups.get(hover.code) : undefined

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <Card className="p-3 sm:p-5">
          <div ref={frame} className="relative">
            <svg
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              role="group"
              aria-label="Map of the United States shaded by average cookie score"
              className="w-full"
              onPointerLeave={() => setHover(null)}
            >
              {SHAPES.map(({ state, d }) => {
                const group = groups.get(state.code)
                const isActive = activeCode === state.code
                return (
                  <path
                    key={state.code}
                    d={d}
                    fill={group ? `var(--seq-${bandOf(group.average) + 1})` : 'var(--oat)'}
                    stroke="var(--paper)"
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                    role="button"
                    tabIndex={0}
                    aria-label={
                      group
                        ? `${state.name}: ${plural(group.count, 'cookie')}, average ${group.average.toFixed(1)}`
                        : `${state.name}: no cookies yet`
                    }
                    aria-pressed={isActive}
                    className={cn(
                      'cursor-pointer transition-[filter,opacity] outline-none',
                      group
                        ? 'hover:brightness-110 focus-visible:brightness-125'
                        : 'hover:brightness-95 focus-visible:brightness-90',
                    )}
                    onClick={() => setSelected(state.code)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setSelected(state.code)
                      }
                    }}
                    onPointerMove={(e) => {
                      const box = frame.current?.getBoundingClientRect()
                      if (box && e.pointerType === 'mouse') {
                        setHover({
                          code: state.code,
                          x: e.clientX - box.left,
                          y: e.clientY - box.top,
                        })
                      }
                    }}
                  />
                )
              })}
              {/* Outline the selected state on top so no neighbour covers it. */}
              {SHAPES.filter((s) => s.state.code === activeCode).map((s) => (
                <path
                  key={s.state.code}
                  d={s.d}
                  fill="none"
                  stroke="var(--ink)"
                  strokeWidth={3}
                  strokeLinejoin="round"
                  pointerEvents="none"
                />
              ))}
            </svg>
            {hover && (
              <div
                role="status"
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-xl border border-line bg-paper px-3 py-2 text-sm whitespace-nowrap shadow-pop"
                style={{ left: hover.x, top: hover.y - 12 }}
              >
                <p className="font-semibold">{stateName(hover.code)}</p>
                <p className="text-ink-soft">
                  {hovered
                    ? `${plural(hovered.count, 'cookie')} · average ${hovered.average.toFixed(1)}`
                    : 'No cookies yet'}
                </p>
              </div>
            )}
          </div>

          <BandLegend />
        </Card>

        <div className="min-w-0 space-y-5">
          {activeCode ? (
            <Card>
              <p className="text-xs font-bold tracking-[0.14em] text-crust uppercase">
                {active
                  ? `${plural(active.count, 'cookie')} · average ${active.average.toFixed(1)}`
                  : 'No cookies yet'}
              </p>
              <SectionTitle className="mt-1 text-2xl">{stateName(activeCode)}</SectionTitle>
              {active && (
                <ul className="-mx-1.5 mt-3">
                  {active.cookies.map((cookie) => (
                    <li key={cookie.id}>
                      <CookieRow cookie={cookie} precision={overallPrecision} />
                    </li>
                  ))}
                </ul>
              )}
              <StatePlaces
                // A fresh list, back at its first few, for each state.
                key={activeCode}
                code={activeCode}
                cookies={cookies}
                online={onlinePlaces}
              />
            </Card>
          ) : (
            <Card className="text-center text-[15px] text-ink-soft">
              Tap a state to see where to try there.
            </Card>
          )}

          {ledger.length > 0 && (
            <Card>
              <SectionTitle>State standings</SectionTitle>
              <ol className="mt-3 divide-y divide-line/70">
                {ledger.map((group, i) => (
                  <li key={group.key}>
                    <button
                      type="button"
                      onClick={() => setSelected(group.key)}
                      aria-pressed={activeCode === group.key}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-1 py-2.5 text-left transition hover:bg-oat',
                        activeCode === group.key && 'font-semibold',
                      )}
                    >
                      <span className="numerals w-6 text-sm text-ink-faint">{i + 1}</span>
                      <span
                        aria-hidden
                        className="size-3 shrink-0 rounded-[4px]"
                        style={{ background: `var(--seq-${bandOf(group.average) + 1})` }}
                      />
                      <span className="min-w-0 flex-1 truncate">{stateName(group.key)}</span>
                      <span className="text-sm text-ink-soft">{plural(group.count, 'cookie')}</span>
                      <span className="numerals w-9 text-right text-lg font-semibold">
                        {group.average.toFixed(1)}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}

/**
 * A state's places to try. A state has far too many bakeries to list, so
 * this is its dedicated cookie shops, what other people have rated highest
 * there, and its biggest towns still to be looked round.
 */
function StatePlaces({
  code,
  cookies,
  online,
}: {
  code: string
  cookies: RatedCookie[]
  online: boolean
}) {
  const [towns, setTowns] = useState<PlaceIndex | null>(null)
  useEffect(() => {
    void loadPlaces().then(setTowns, () => {})
  }, [])
  const mine = useMemo(() => bakeryPlaces(cookies, towns), [cookies, towns])

  const shops = usePlacesLookup(`state:${code}`, online, async (signal) => {
    const shape = SHAPES.find((s) => s.state.code === code)
    const bounds = shape ? worldBounds(shape.box) : null
    // Alaska's islands reach across the date line, which no single rectangle covers.
    if (!bounds || bounds.east - bounds.west > 40) return []
    // The rectangle takes in corners of the states next door; keep this one's.
    return (await cookieShopsWithin(bounds, signal)).filter((place) => place.state === code)
  })
  const community = useCommunity()

  const favourites = useMemo(
    () =>
      community.status === 'ready'
        ? rankCookies(community.cookies.filter((cookie) => cookie.state === code))
            .filter((cookie) => !cookies.some((own) => sameCookie(cookie, own)))
            .slice(0, 3)
        : [],
    [community, code, cookies],
  )
  const untried = useMemo(
    () => (shops.status === 'ready' ? foldChains(notYetRated(shops.places, mine)) : []),
    [shops, mine],
  )
  const toExplore = useMemo(
    () => (towns ? bigTownsToTry(cookies, towns, code) : []),
    [towns, cookies, code],
  )

  return (
    <PlacesToTry
      favourites={favourites}
      lookup={shops.status}
      places={untried}
      online={online}
      towns={toExplore}
    />
  )
}
