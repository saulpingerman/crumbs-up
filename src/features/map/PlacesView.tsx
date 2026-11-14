import { LoaderCircle, MapPin, Plus, Search } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ButtonLink } from '@/components/Button'
import { CookieRow } from '@/components/CookieRow'
import { Card, SectionTitle } from '@/components/Page'
import { bakeryPlaces, type BakeryPlace } from '@/lib/bakery-places'
import { cn } from '@/lib/cn'
import { formatAverage, plural } from '@/lib/format'
import { bakeriesNear, formatMiles, type NearbyPlace } from '@/lib/osm'
import { loadPlaces, type PlaceIndex } from '@/lib/places'
import { resolveTheme, useSettings } from '@/lib/settings'
import type { RatedCookie } from '@/lib/stats'
import { OpenInMaps } from './OpenInMaps'
import { SETTLE_MS, TOO_WIDE_KM, searchArea, worthSearching, type SearchedArea } from './nearby'
import type { MapPin as Pin, MapView } from './PlacesMap'

// The map library is large, so it only loads when this view is opened.
const PlacesMap = lazy(() => import('./PlacesMap').then((m) => ({ default: m.PlacesMap })))

/** "Flour & Salt Bakery" and "flour and salt" are the same shop. */
function essence(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\b(the|bakery|bakeshop|bakehouse|baking|co|company|cafe|café|shop)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
}

/** How likely a place is to have a cookie worth rating, going by its name. */
function promise(name: string): number {
  if (/cookie|crumbl|levain|insomnia/i.test(name)) return 1
  if (/dou?gh ?nut|bagel|pretzel|cupcake|cheesecake|tortill/i.test(name)) return -1
  return 0
}

function rateLink(
  bakery: string,
  city: string,
  state: string,
  spot?: { lat: number; lng: number },
) {
  const params = new URLSearchParams({ bakery, city, state })
  if (spot) {
    params.set('lat', String(spot.lat))
    params.set('lng', String(spot.lng))
  }
  return `/rate?${params}`
}

export function PlacesView({ cookies }: { cookies: RatedCookie[] }) {
  const settings = useSettings()
  const dark = resolveTheme(settings.theme) === 'dark'

  const [towns, setTowns] = useState<PlaceIndex | null>(null)
  useEffect(() => {
    void loadPlaces().then(setTowns, () => {})
  }, [])

  const places = useMemo(() => bakeryPlaces(cookies, towns), [cookies, towns])
  const [found, setFound] = useState<NearbyPlace[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** Where the look for new bakeries around the current view has got to. */
  const [search, setSearch] = useState<'idle' | 'looking' | 'done' | 'failed'>('idle')
  const [view, setView] = useState<MapView | null>(null)
  const card = useRef<HTMLDivElement>(null)
  /** The last stretch of map that was searched, so a nudge doesn't ask again. */
  const searched = useRef<SearchedArea | null>(null)
  /** What the search needs to know but shouldn't restart for. */
  const latest = useRef({ places, selectedId })
  useEffect(() => {
    latest.current = { places, selectedId }
  }, [places, selectedId])

  // Once the map has sat still for a moment, look for bakeries around it that
  // aren't in the journal yet. Nobody has to ask.
  useEffect(() => {
    if (!settings.onlinePlaces || !view || !worthSearching(searched.current, view)) return
    const area = searchArea(view)
    const stop = new AbortController()
    let looking = false
    const timer = setTimeout(() => {
      looking = true
      setSearch('looking')
      const visited = new Set(latest.current.places.map((p) => `${essence(p.bakery)}|${p.state}`))
      bakeriesNear(area.center, area.radiusKm, stop.signal)
        .then((places) => {
          const nearby = places
            .filter((p) => essence(p.name) && !visited.has(`${essence(p.name)}|${p.state}`))
            // Nearest first, but a cookie shop outranks a doughnut shop next door.
            .sort((a, b) => promise(b.name) - promise(a.name) || a.km - b.km)
            .slice(0, 40)
          searched.current = area
          // Whatever is open in the card stays, even if the map has moved off it.
          setFound((before) => {
            const open = before.find((p) => `f:${p.id}` === latest.current.selectedId)
            return open && !nearby.some((p) => p.id === open.id) ? [open, ...nearby] : nearby
          })
          looking = false
          setSearch('done')
        })
        .catch((error: unknown) => {
          if (stop.signal.aborted) return
          console.warn(error)
          looking = false
          setSearch('failed')
        })
    }, SETTLE_MS)
    return () => {
      clearTimeout(timer)
      stop.abort()
      // The map moved on before an answer came back.
      if (looking) setSearch('idle')
    }
  }, [view, settings.onlinePlaces])

  const pins = useMemo<Pin[]>(
    () => [
      ...places
        .filter((p) => p.position)
        .map((p): Pin => ({
          id: `m:${p.key}`,
          kind: 'mine',
          title: p.bakery,
          // The same figure the list underneath shows, minus a trailing ".0".
          score: formatAverage(p.average).replace(/\.0$/, ''),
          ...p.position!,
        })),
      ...found.map((p): Pin => ({
        id: `f:${p.id}`,
        kind: 'found',
        title: p.name,
        lat: p.lat,
        lng: p.lng,
      })),
    ],
    [places, found],
  )

  const selectedMine = places.find((p) => `m:${p.key}` === selectedId)
  const selectedFound = found.find((p) => `f:${p.id}` === selectedId)

  function select(id: string, fromMap = false) {
    setSelectedId(id)
    // A tap on the map happens above the card; bring the answer into view.
    if (fromMap)
      requestAnimationFrame(() =>
        card.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
      )
  }

  const tooWide = view !== null && view.radiusKm > TOO_WIDE_KM
  /** One quiet line on the map saying what the search is up to. */
  const notice = tooWide
    ? 'Zoom in to find bakeries'
    : search === 'looking'
      ? 'Looking for bakeries…'
      : search === 'failed'
        ? 'Couldn’t look for bakeries just now'
        : search === 'done'
          ? found.length > 0
            ? `${plural(found.length, 'bakery', 'bakeries')} to try here`
            : 'No new bakeries here'
          : null
  const unplaced = places.filter((p) => !p.position)

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
      <div className="lg:sticky lg:top-20">
        <div className="relative overflow-hidden rounded-3xl border border-line shadow-card">
          <Suspense
            fallback={<div className="h-[52dvh] min-h-80 animate-pulse bg-oat lg:h-[34rem]" />}
          >
            <PlacesMap
              pins={pins}
              selectedId={selectedId}
              onSelect={(id) => select(id, true)}
              onView={setView}
              dark={dark}
              className="h-[52dvh] min-h-80 lg:h-[34rem]"
            />
          </Suspense>
          {settings.onlinePlaces && notice && (
            <p
              role="status"
              className="pointer-events-none absolute top-3 left-3 flex max-w-[calc(100%-4.5rem)] items-center gap-2 rounded-full bg-paper/95 px-3.5 py-2 text-sm font-semibold shadow-card"
            >
              {search === 'looking' && !tooWide ? (
                <LoaderCircle className="size-4 shrink-0 animate-spin" />
              ) : (
                <Search className="size-4 shrink-0 text-crust" />
              )}
              {notice}
            </p>
          )}
        </div>
        <p className="mt-2 px-1 text-xs leading-relaxed text-ink-faint">
          Gold pins are bakeries you’ve rated, with their average score.{' '}
          {settings.onlinePlaces
            ? 'Rings are bakeries from OpenStreetMap you haven’t tried; they appear as you move in close.'
            : 'Online bakery search is turned off in Settings.'}
        </p>
      </div>

      <div className="min-w-0 space-y-5">
        <div ref={card} className="scroll-mt-24">
          {selectedMine && <MinePlace place={selectedMine} />}
          {selectedFound && <FoundPlace place={selectedFound} />}
        </div>

        {found.length > 0 && (
          <Card>
            <SectionTitle>Somewhere new nearby</SectionTitle>
            <ul className="mt-2 divide-y divide-line/70">
              {found.slice(0, 12).map((place) => (
                <li key={place.id}>
                  <PlaceButton
                    active={selectedId === `f:${place.id}`}
                    onClick={() => select(`f:${place.id}`)}
                    title={place.name}
                    detail={[place.street, place.city].filter(Boolean).join(', ')}
                    trailing={formatMiles(place.km)}
                  />
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink-faint">
              Places © OpenStreetMap contributors. Listings can be out of date — check before a long
              drive.
            </p>
          </Card>
        )}

        <Card>
          <SectionTitle>Your places</SectionTitle>
          {places.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">
              Nothing yet. Rate a cookie and its bakery shows up here and on the map.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-line/70">
              {places
                .filter((p) => p.position)
                .map((place) => (
                  <li key={place.key}>
                    <PlaceButton
                      active={selectedId === `m:${place.key}`}
                      onClick={() => select(`m:${place.key}`)}
                      title={place.bakery}
                      detail={`${[place.city, place.state].filter(Boolean).join(', ')} · ${plural(place.cookies.length, 'cookie')}`}
                      trailing={formatAverage(place.average)}
                      numeric
                    />
                  </li>
                ))}
            </ul>
          )}
          {unplaced.length > 0 && (
            <div className="mt-4 rounded-2xl bg-oat px-4 py-3 text-sm">
              <p className="font-semibold">Not on the map yet</p>
              <p className="mt-0.5 text-ink-soft">
                {unplaced.map((p) => p.bakery).join(', ')} — the map only knows U.S. towns, and
                couldn’t place {unplaced.length === 1 ? 'this one' : 'these'}. Check the town and
                state on {unplaced.length === 1 ? 'its cookie' : 'their cookies'}, or pin the exact
                spot with “Use my location” next time you’re there.
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function PlaceButton({
  active,
  onClick,
  title,
  detail,
  trailing,
  numeric,
}: {
  active: boolean
  onClick: () => void
  title: string
  detail: string
  trailing: string
  numeric?: boolean
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-1 py-2.5 text-left transition hover:bg-oat',
        active && 'bg-oat',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{title}</span>
        <span className="block truncate text-[13px] text-ink-soft">{detail}</span>
      </span>
      <span
        className={cn(
          'shrink-0 text-sm text-ink-soft',
          numeric && 'numerals text-lg font-semibold text-ink',
        )}
      >
        {trailing}
      </span>
    </button>
  )
}

function MinePlace({ place }: { place: BakeryPlace }) {
  const { overallPrecision } = useSettings()
  return (
    <Card>
      <p className="text-xs font-bold tracking-[0.14em] text-crust uppercase">
        {plural(place.cookies.length, 'cookie')} · average {formatAverage(place.average)}
      </p>
      <SectionTitle className="mt-1 text-2xl">{place.bakery}</SectionTitle>
      <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-soft">
        <MapPin className="size-4 shrink-0" aria-hidden />
        {[place.city, place.state].filter(Boolean).join(', ')}
        {!place.exact && ' · placed by town'}
      </p>
      <ul className="-mx-1.5 mt-3">
        {place.cookies.map((cookie) => (
          <li key={cookie.id}>
            <CookieRow
              cookie={cookie}
              precision={overallPrecision}
              detail={cookie.notes || undefined}
            />
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <ButtonLink
          size="sm"
          to={rateLink(
            place.bakery,
            place.city,
            place.state,
            place.exact ? place.position! : undefined,
          )}
        >
          <Plus className="size-4" strokeWidth={2.6} />
          Rate another here
        </ButtonLink>
        <OpenInMaps bakery={place.bakery} city={place.city} state={place.state} />
      </div>
    </Card>
  )
}

function FoundPlace({ place }: { place: NearbyPlace }) {
  return (
    <Card>
      <p className="text-xs font-bold tracking-[0.14em] text-crust uppercase">
        Not rated yet · {formatMiles(place.km)} from the middle of the map
      </p>
      <SectionTitle className="mt-1 text-2xl">{place.name}</SectionTitle>
      <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-soft">
        <MapPin className="size-4 shrink-0" aria-hidden />
        {[place.street, place.city, place.state].filter(Boolean).join(', ') || 'Address not listed'}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <ButtonLink size="sm" to={rateLink(place.name, place.city, place.state, place)}>
          <Plus className="size-4" strokeWidth={2.6} />
          Rate a cookie here
        </ButtonLink>
        <OpenInMaps bakery={place.name} city={place.city} state={place.state} />
      </div>
      <p className="mt-3 text-xs text-ink-faint">
        From OpenStreetMap — it lists bakeries, not whether they sell cookies.{' '}
        <Link to="/discover" className="font-semibold underline">
          What to order
        </Link>
      </p>
    </Card>
  )
}
