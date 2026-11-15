import { geoPath } from 'd3-geo'
import { useMemo, useRef, useState } from 'react'
import { feature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import usAtlas from 'us-atlas/states-albers-10m.json'
import { CookieRow } from '@/components/CookieRow'
import { Card, SectionTitle } from '@/components/Page'
import { cn } from '@/lib/cn'
import { plural } from '@/lib/format'
import { useSettings } from '@/lib/settings'
import { stateByFips, stateName, US_STATES } from '@/lib/states'
import { byAverageDesc, groupByState, type Group, type RatedCookie } from '@/lib/stats'
import { BandLegend } from './BandLegend'
import { bandOf } from './bands'

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
      return state ? { state, d: path(f) ?? '', x, y } : null
    })
    .filter((s) => s !== null)
})()

interface Props {
  cookies: RatedCookie[]
}

/** The country shaded by how good each state's cookies have been. Works offline. */
export function StatesView({ cookies }: Props) {
  const { overallPrecision } = useSettings()
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

  const active = selected ? groups.get(selected) : (ledger[0] ?? undefined)
  const activeCode = selected ?? ledger[0]?.key ?? null
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
                    role={group ? 'button' : undefined}
                    tabIndex={group ? 0 : undefined}
                    aria-label={
                      group
                        ? `${state.name}: ${plural(group.count, 'cookie')}, average ${group.average.toFixed(1)}`
                        : undefined
                    }
                    aria-pressed={group ? isActive : undefined}
                    className={cn(
                      'transition-[filter,opacity] outline-none',
                      group && 'cursor-pointer hover:brightness-110 focus-visible:brightness-125',
                    )}
                    onClick={group ? () => setSelected(state.code) : undefined}
                    onKeyDown={(e) => {
                      if (group && (e.key === 'Enter' || e.key === ' ')) {
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
              {SHAPES.filter((s) => s.state.code === activeCode && groups.has(s.state.code)).map(
                (s) => (
                  <path
                    key={s.state.code}
                    d={s.d}
                    fill="none"
                    stroke="var(--ink)"
                    strokeWidth={3}
                    strokeLinejoin="round"
                    pointerEvents="none"
                  />
                ),
              )}
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
          {active && (
            <Card>
              <p className="text-xs font-bold tracking-[0.14em] text-crust uppercase">
                {plural(active.count, 'cookie')} · average {active.average.toFixed(1)}
              </p>
              <SectionTitle className="mt-1 text-2xl">{stateName(active.key)}</SectionTitle>
              <ul className="-mx-1.5 mt-3">
                {active.cookies.map((cookie) => (
                  <li key={cookie.id}>
                    <CookieRow cookie={cookie} precision={overallPrecision} />
                  </li>
                ))}
              </ul>
            </Card>
          )}

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
        </div>
      </div>
    </>
  )
}
