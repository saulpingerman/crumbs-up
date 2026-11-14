import { LoaderCircle, MapPin, Plus, Search } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Button, ButtonLink } from '@/components/Button'
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
import type { MapPin as Pin, MapView } from './PlacesMap'

// The map library is large, so it only loads when this view is opened.
const PlacesMap = lazy(() => import('./PlacesMap').then((m) => ({ default: m.PlacesMap })))

/** Photon looks at most this far from the middle of the map. */
const MAX_SEARCH_KM = 15
/** Beyond this the view covers too much ground for "nearby" to mean anything. */
const TOO_WIDE_KM = 80

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
  const [searching, setSearching] = useState(false)
  const [view, setView] = useState<MapView | null>(null)
  const card = useRef<HTMLDivElement>(null)

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

  async function search() {
    if (!view) return
    setSearching(true)
    try {
      const visited = new Set(places.map((p) => `${essence(p.bakery)}|${p.state}`))
      const nearby = (await bakeriesNear(view.center, Math.min(MAX_SEARCH_KM, view.radiusKm)))
        .filter((p) => essence(p.name) && !visited.has(`${essence(p.name)}|${p.state}`))
        // Nearest first, but a cookie shop outranks a doughnut shop next door.
        .sort((a, b) => promise(b.name) - promise(a.name) || a.km - b.km)
        .slice(0, 40)
      setFound(nearby)
      if (nearby.length === 0) {
        toast('No new bakeries turned up here', {
          description: 'Try moving the map or zooming out a little.',
        })
      } else {
        toast.success(`Found ${plural(nearby.length, 'bakery', 'bakeries')} you haven’t rated`)
        select(`f:${nearby[0]!.id}`)
      }
    } catch (error) {
      console.warn(error)
      toast.error('Couldn’t search right now', {
        description: 'Check your connection and try again.',
      })
    } finally {
      setSearching(false)
    }
  }

  const tooWide = view !== null && view.radiusKm > TOO_WIDE_KM
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
          {settings.onlinePlaces && (
            <Button
              size="sm"
              onClick={() => void search()}
              disabled={searching || !view || tooWide}
              className="absolute top-3 left-3 disabled:opacity-80"
            >
              {searching ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
              {tooWide ? 'Zoom in to find bakeries' : 'Find bakeries here'}
            </Button>
          )}
        </div>
        <p className="mt-2 px-1 text-xs leading-relaxed text-ink-faint">
          Gold pins are bakeries you’ve rated, with their average score.{' '}
          {settings.onlinePlaces
            ? 'Rings are bakeries from OpenStreetMap you haven’t tried.'
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
