import { Heart, MapPin, Plus } from 'lucide-react'
import { Link } from 'react-router'
import { Card, Empty, Page } from '@/components/Page'
import { DiscoverTabs } from '@/features/community/DiscoverTabs'
import { OpenInMaps } from '@/features/map/OpenInMaps'
import { rateLink } from '@/features/map/suggest'
import { useWantToGo } from '@/lib/want-to-go'
import { WantToGoButton } from './WantToGoButton'

/** Bakeries saved from the map and the lists of places to try. */
export function WantToGoPage() {
  const places = useWantToGo()

  return (
    <Page title="Want to go" action={<DiscoverTabs />}>
      {places && places.length === 0 && (
        <Empty title="Nowhere saved yet" art={<Heart className="size-14 text-ink-faint" />}>
          Tap the heart on a bakery on the map to save it here.
        </Empty>
      )}
      {places && places.length > 0 && (
        <ul className="grid gap-3 md:grid-cols-2">
          {places.map((place) => (
            <li key={place.id}>
              <Card>
                <p className="font-display text-xl leading-tight font-semibold [overflow-wrap:anywhere]">
                  {place.name}
                </p>
                <p className="mt-1 flex items-start gap-1.5 text-sm text-ink-soft">
                  <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {[place.street, place.city, place.state].filter(Boolean).join(', ') ||
                    'Address not listed'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    to={rateLink(place.name, place.city, place.state, place)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-cocoa px-3.5 text-sm font-semibold text-on-cocoa transition active:scale-95"
                  >
                    <Plus className="size-4" strokeWidth={2.6} />
                    Rate here
                  </Link>
                  <Link
                    to={`/map?lat=${place.lat}&lng=${place.lng}`}
                    className="inline-flex h-9 items-center rounded-full border border-line bg-paper px-3.5 text-sm font-semibold transition hover:bg-oat"
                  >
                    On the map
                  </Link>
                  <OpenInMaps bakery={place.name} city={place.city} state={place.state} />
                  <WantToGoButton place={place} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </Page>
  )
}
