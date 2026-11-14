import { useState } from 'react'
import { Segmented } from '@/components/Field'
import { Page } from '@/components/Page'
import { plural } from '@/lib/format'
import { summarize } from '@/lib/stats'
import { useCookies } from '@/lib/use-cookies'
import { PlacesView } from './PlacesView'
import { StatesView } from './StatesView'

type View = 'places' | 'states'

export function MapPage() {
  const cookies = useCookies()
  const [view, setView] = useState<View>('places')
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
            { value: 'states', label: 'States' },
          ]}
        />
      }
    >
      {view === 'places' ? <PlacesView cookies={cookies} /> : <StatesView cookies={cookies} />}
    </Page>
  )
}
