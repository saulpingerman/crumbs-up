import { lazy, Suspense, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Segmented } from '@/components/Field'
import { Page } from '@/components/Page'
import { plural } from '@/lib/format'
import { summarize } from '@/lib/stats'
import { useCookies } from '@/lib/use-cookies'
import { PlacesView } from './PlacesView'
import { StatesView } from './StatesView'

// The county outlines are a few hundred kilobytes; they wait until asked for.
const CountiesView = lazy(() => import('./CountiesView').then((m) => ({ default: m.CountiesView })))

type View = 'places' | 'counties' | 'states'

export function MapPage() {
  const cookies = useCookies()
  const [view, setView] = useState<View>('places')
  // A link to a spot ("towns to look round" on a state, say) is a request for
  // the street map there, whichever view happens to be open.
  const [params] = useSearchParams()
  const spot = params.has('lat') && params.has('lng') ? params.toString() : ''
  const [seenSpot, setSeenSpot] = useState(spot)
  if (spot !== seenSpot) {
    setSeenSpot(spot)
    if (spot) setView('places')
  }
  if (!cookies) return null

  const summary = summarize(cookies)

  return (
    <Page
      title="Cookie map"
      lede={
        cookies.length === 0 ? (
          'Every bakery you rate gets a pin here. Until then, use it to scout somewhere new.'
        ) : (
          <>
            You’ve rated cookies in{' '}
            <strong className="font-semibold text-ink">{plural(summary.towns, 'town')}</strong>
            {summary.states > 1 && ` across ${summary.states} states`}.
          </>
        )
      }
      action={
        <Segmented<View>
          label="Map view"
          value={view}
          onChange={setView}
          options={[
            { value: 'places', label: 'Places' },
            { value: 'counties', label: 'Counties' },
            { value: 'states', label: 'States' },
          ]}
        />
      }
    >
      {view === 'places' && <PlacesView cookies={cookies} />}
      {view === 'counties' && (
        <Suspense fallback={<div aria-busy className="h-80 animate-pulse rounded-3xl bg-oat" />}>
          <CountiesView cookies={cookies} />
        </Suspense>
      )}
      {view === 'states' && <StatesView cookies={cookies} />}
    </Page>
  )
}
