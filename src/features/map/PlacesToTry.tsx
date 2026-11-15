import { MapPin, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/Button'
import { Medallion } from '@/components/Score'
import type { CommunityCookie } from '@/lib/community'
import { formatAverage, plural } from '@/lib/format'
import { OpenInMaps } from './OpenInMaps'
import { rateLink, type Suggestion } from './suggest'
import type { PlacesLookup } from './use-places-lookup'

/** How many places a list starts with. */
const FIRST_FEW = 6

/** A town worth opening the map on. */
export interface TownToExplore {
  name: string
  state: string
  lat: number
  lng: number
}

interface Props {
  /** What other people have rated highest here, that isn't in the journal. */
  favourites: CommunityCookie[]
  /** Where the look for places has got to. */
  lookup: PlacesLookup['status']
  /** Places that aren't in the journal yet, in the order to show them. */
  places: Suggestion[]
  /** Whether looking places up online is allowed at all. */
  online: boolean
  /** Towns to go and look round, for an area too big to list every bakery in. */
  towns?: TownToExplore[]
}

/**
 * Where to go in an area: what other people have rated highest there, the
 * places on the map that aren't in the journal yet, and — for somewhere as
 * big as a state — towns to open the map on.
 */
export function PlacesToTry({ favourites, lookup, places, online, towns = [] }: Props) {
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? places : places.slice(0, FIRST_FEW)
  const nothing = favourites.length === 0 && places.length === 0 && towns.length === 0

  return (
    <section className="mt-4 border-t border-line/70 pt-4">
      <h3 className="font-display text-lg font-semibold">Places to try</h3>

      {favourites.length > 0 && (
        <ul className="mt-2 space-y-2">
          {favourites.map((cookie) => (
            <li
              key={`${cookie.cookieType}|${cookie.bakery}|${cookie.city}`}
              className="flex items-center gap-3 rounded-2xl bg-oat/60 px-3 py-2.5"
            >
              <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                <p className="font-semibold">{cookie.cookieType}</p>
                <p className="text-sm text-ink-soft">
                  {[cookie.bakery, cookie.city].filter(Boolean).join(', ')} · rated by{' '}
                  {plural(cookie.raters, 'person', 'people')}
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

      {lookup === 'looking' && (
        <p role="status" className="mt-2 text-sm text-ink-soft">
          Looking for places…
        </p>
      )}
      {lookup === 'failed' && (
        <p role="status" className="mt-2 text-sm text-ink-soft">
          Couldn’t look for places just now.
        </p>
      )}
      {lookup === 'ready' && nothing && (
        <p role="status" className="mt-2 text-sm text-ink-soft">
          Nothing listed here that you haven’t tried.
        </p>
      )}
      {!online && nothing && (
        <p className="mt-2 text-sm text-ink-soft">
          Looking up bakeries is switched off in Settings.
        </p>
      )}

      {shown.length > 0 && (
        <ul className="mt-2 divide-y divide-line/70">
          {shown.map(({ key, name, detail, place }) => (
            <li key={key} className="py-3">
              <p className="font-semibold [overflow-wrap:anywhere]">{name}</p>
              <p className="flex items-start gap-1.5 text-sm text-ink-soft">
                <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {detail || 'Address not listed'}
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
      {places.length > shown.length && (
        <Button variant="secondary" className="mt-1 w-full" onClick={() => setShowAll(true)}>
          Show all {places.length}
        </Button>
      )}

      {towns.length > 0 && (
        <div className="mt-3">
          <p className="text-sm font-semibold">Towns to look round</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {towns.map((town) => (
              <li key={`${town.name}|${town.state}`}>
                {/* Opens the street map there, which finds its bakeries by itself. */}
                <Link
                  to={`/map?lat=${town.lat}&lng=${town.lng}`}
                  className="inline-flex h-9 items-center rounded-full border border-line bg-paper px-3.5 text-sm font-semibold transition hover:bg-oat"
                >
                  {town.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {places.length > 0 && (
        <p className="mt-3 text-xs text-ink-faint">
          Places © OpenStreetMap contributors. It lists shops, not what they sell.
        </p>
      )}
    </section>
  )
}
