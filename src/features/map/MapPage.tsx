import { useState } from 'react'
import { Segmented } from '@/components/Field'
import { Page } from '@/components/Page'
import { PASSPORT_SIZE } from '@/lib/states'
import { summarize } from '@/lib/stats'
import { useCookies } from '@/lib/use-cookies'
import { PlacesView } from './PlacesView'
import { StatesView } from './StatesView'

type View = 'places' | 'states'

export function MapPage() {
  const cookies = useCookies()
  const [view, setView] = useState<View>('places')
  if (!cookies) return null

  const visited = summarize(cookies).states

  return (
    <Page
      title="Cookie map"
      lede={
        cookies.length === 0 ? (
          'Every bakery you rate gets a pin here. Until then, use it to scout somewhere new.'
        ) : (
          <>
            You’ve rated cookies in{' '}
            <strong className="font-semibold text-ink">
              {visited} of {PASSPORT_SIZE}
            </strong>{' '}
            — the fifty states plus D.C.
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
      <div
        role="meter"
        aria-label="States visited"
        aria-valuemin={0}
        aria-valuemax={PASSPORT_SIZE}
        aria-valuenow={visited}
        className="mb-5 h-2 overflow-hidden rounded-full bg-oat"
      >
        <div
          className="h-full rounded-full bg-crust transition-[width] duration-700 ease-out-soft"
          style={{ width: `${(visited / PASSPORT_SIZE) * 100}%` }}
        />
      </div>
      {view === 'places' ? <PlacesView cookies={cookies} /> : <StatesView cookies={cookies} />}
    </Page>
  )
}
