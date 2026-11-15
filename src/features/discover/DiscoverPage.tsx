import { ArrowRight, Compass, MapPinned, Plus, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ButtonLink } from '@/components/Button'
import { CookiePhoto } from '@/components/CookiePhoto'
import { CookieRow } from '@/components/CookieRow'
import { Card, Page, SectionTitle } from '@/components/Page'
import type { CookieKind } from '@/lib/cookie-kinds'
import { aScore, formatPlace, plural } from '@/lib/format'
import { formatMiles } from '@/lib/osm'
import { formatScore } from '@/lib/rubric'
import { MIN_FOR_PALATE, listTastes, recommend, type Taste } from '@/lib/recommend'
import { useSettings } from '@/lib/settings'
import { loadPlaces, type PlaceIndex } from '@/lib/places'
import { newTowns } from '@/lib/towns'
import { useCookies } from '@/lib/use-cookies'
import { OpenInMaps } from '../map/OpenInMaps'

/** Why a kind was suggested, in a sentence. */
function because(tastes: Taste[]): string | null {
  return tastes.length > 0 ? `Plays to your taste for ${listTastes(tastes)}.` : null
}

export function DiscoverPage() {
  const cookies = useCookies()
  const { overallPrecision } = useSettings()
  const recs = useMemo(() => (cookies ? recommend(cookies) : null), [cookies])
  // Towns come from a list bundled with the app, loaded when first needed.
  const [places, setPlaces] = useState<PlaceIndex | null>(null)
  useEffect(() => {
    void loadPlaces().then(setPlaces, () => {})
  }, [])
  const nearby = useMemo(
    () => (cookies && places ? newTowns(cookies, places) : []),
    [cookies, places],
  )
  if (!cookies || !recs) return null

  const missing = Math.max(1, MIN_FOR_PALATE - cookies.length)
  // The cookies the palate was read from, each named once.
  const favorites = [...new Map(recs.likes.map((t) => [t.example.id, t.example])).values()].slice(
    0,
    2,
  )

  return (
    <Page title="Discover" lede="What to try next, worked out from your own ratings.">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <SectionTitle>
            {recs.personal ? 'Your palate so far' : 'Still getting to know you'}
          </SectionTitle>
          {recs.personal ? (
            <>
              <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
                {recs.likes.length > 0 ? (
                  <>
                    Your best scores go to cookies with{' '}
                    <strong className="font-semibold text-ink">
                      {listTastes(recs.likes.slice(0, 3))}
                    </strong>
                    .
                  </>
                ) : (
                  'Your scores are remarkably even — no flavor or texture runs away with it yet.'
                )}{' '}
                {recs.dislikes.length > 0 && (
                  <>You’re harder to win over with {listTastes(recs.dislikes.slice(0, 2))}. </>
                )}
                {favorites.length > 0 && (
                  <>
                    That’s going by{' '}
                    {favorites
                      .map((c) => `${c.cookieType} (${formatScore(c.overall)})`)
                      .join(' and ')}
                    , among others.
                  </>
                )}
              </p>
              {recs.likes.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {recs.likes.slice(0, 5).map((taste) => (
                    <li
                      key={taste.trait}
                      className="rounded-full bg-texture-soft px-3 py-1.5 text-[13px] font-semibold first-letter:uppercase"
                    >
                      {taste.label}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
              Rate {plural(missing, 'more cookie')} and this page will suggest cookies based on what
              you like. For now, these are the classics.
            </p>
          )}
        </Card>

        <section className="lg:col-span-2">
          <SectionTitle className="mb-3 px-1 text-2xl">
            {recs.personal ? 'Order one of these next' : 'Start with the classics'}
          </SectionTitle>
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recs.tryNext.map(({ kind, because: why }) => (
              <li key={kind.id}>
                <KindCard kind={kind} why={because(why)} />
              </li>
            ))}
          </ul>
        </section>

        {recs.secondChances.length > 0 && (
          <Card>
            <SectionTitle className="flex items-center gap-2">
              <RotateCcw className="size-5 text-crust" aria-hidden />
              Worth a second chance
            </SectionTitle>
            <p className="mt-1 text-sm text-ink-soft">
              Going by everything else you’ve rated, you should like these. The one you had may just
              have been a poor example.
            </p>
            <ul className="-mx-1.5 mt-3">
              {recs.secondChances.map(({ kind, cookie }) => (
                <li key={kind.id}>
                  <CookieRow
                    cookie={cookie}
                    precision={overallPrecision}
                    eyebrow={kind.name}
                    detail={`${cookie.bakery} · ${formatPlace(cookie)}`}
                  />
                </li>
              ))}
            </ul>
          </Card>
        )}

        {recs.returnTrips.length > 0 && (
          <Card>
            <SectionTitle className="flex items-center gap-2">
              <MapPinned className="size-5 text-crust" aria-hidden />
              Worth a return trip
            </SectionTitle>
            <p className="mt-1 text-sm text-ink-soft">
              Bakeries that impressed you, where you’ve barely started on the case.
            </p>
            <ul className="mt-3 space-y-4">
              {recs.returnTrips.map((trip) => (
                <li key={`${trip.bakery}|${trip.state}`}>
                  <p className="font-semibold">{trip.bakery}</p>
                  <p className="text-sm text-ink-soft">
                    {formatPlace(trip)} · their {trip.best.cookieType} got{' '}
                    {aScore(formatScore(trip.best.overall))}
                    {trip.count > 1
                      ? `, across ${trip.count} cookies`
                      : ', the only one you’ve tried'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <ButtonLink
                      size="sm"
                      variant="soft"
                      to={`/rate?${new URLSearchParams({ bakery: trip.bakery, city: trip.city, state: trip.state })}`}
                    >
                      <Plus className="size-4" strokeWidth={2.6} />
                      Rate another here
                    </ButtonLink>
                    <OpenInMaps bakery={trip.bakery} city={trip.city} state={trip.state} />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {nearby.length > 0 && (
          <Card>
            <SectionTitle className="flex items-center gap-2">
              <Compass className="size-5 text-crust" aria-hidden />
              New territory
            </SectionTitle>
            <p className="mt-1 text-sm text-ink-soft">
              Towns near you where you haven’t logged a cookie yet.
            </p>
            <ul className="mt-3 divide-y divide-line/70">
              {nearby.map((town) => (
                <li key={`${town.name}|${town.state}`}>
                  {/* Opens the map there, which finds its bakeries by itself. */}
                  <Link
                    to={`/map?lat=${town.lat}&lng=${town.lng}`}
                    className="-mx-2 flex items-baseline justify-between gap-3 rounded-xl px-2 py-2.5 transition hover:bg-oat"
                  >
                    <span className="font-semibold">
                      {town.name}, {town.state}
                    </span>
                    <span className="shrink-0 text-sm text-ink-soft">
                      {formatMiles(town.km)} from {town.from}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Link
          to="/map"
          className="group flex items-center gap-4 rounded-3xl bg-cocoa p-5 text-on-cocoa shadow-card transition active:scale-[0.99]"
        >
          <span className="min-w-0 flex-1">
            <span className="block font-display text-xl font-semibold">Scout a bakery nearby</span>
            <span className="mt-0.5 block text-sm opacity-80">
              Open the map and search any neighborhood for bakeries you haven’t rated.
            </span>
          </span>
          <ArrowRight className="size-6 shrink-0 transition-transform group-hover:translate-x-1" />
        </Link>
      </div>
    </Page>
  )
}

function KindCard({ kind, why }: { kind: CookieKind; why: string | null }) {
  // A stand-in cookie so the suggestion gets the same illustration a rated one would.
  const stand = {
    id: `kind:${kind.id}`,
    hasPhoto: false,
    updatedAt: 0,
    cookieType: kind.name,
    bakery: '',
    answers: {},
    scores: { taste: 7, texture: 7, appearance: 7.5 },
  }
  return (
    <article className="flex h-full gap-3 rounded-3xl border border-line bg-paper p-3 shadow-card">
      <CookiePhoto cookie={stand} className="size-24 shrink-0 rounded-2xl" />
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="font-display text-[19px] leading-tight font-semibold">{kind.name}</h3>
        <p className="mt-1 text-[13.5px] leading-snug text-ink-soft">{why ?? kind.lookFor}</p>
        {why && (
          <p className="mt-1.5 text-[13px] leading-snug text-ink-faint">
            <span className="font-semibold text-ink-soft">A great one:</span> {kind.lookFor}
          </p>
        )}
        <Link
          to={`/rate?${new URLSearchParams({ type: kind.name.replace(/ or .*/, '') })}`}
          className="mt-auto flex items-center gap-1 pt-2 text-sm font-bold text-crust underline-offset-4 hover:underline"
        >
          Found one? Rate it
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </article>
  )
}
