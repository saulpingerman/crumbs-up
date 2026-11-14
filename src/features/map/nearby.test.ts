import { describe, expect, it } from 'vitest'
import { searchArea, worthSearching } from './nearby'

const portland = { lat: 45.52, lng: -122.67 }
/** Roughly this many kilometres east of Portland. */
const east = (km: number) => ({ lat: portland.lat, lng: portland.lng + km / 78 })

describe('searching the map by itself', () => {
  it('searches the first view it is shown', () => {
    expect(worthSearching(null, { center: portland, radiusKm: 6 })).toBe(true)
  })

  it('does not search a view that takes in half a state', () => {
    expect(worthSearching(null, { center: portland, radiusKm: 200 })).toBe(false)
  })

  it('lets a nudge of the map go by', () => {
    const last = { center: portland, radiusKm: 6 }
    expect(worthSearching(last, { center: east(1), radiusKm: 6 })).toBe(false)
    expect(worthSearching(last, { center: portland, radiusKm: 7 })).toBe(false)
  })

  it('searches again after a real move or a real zoom', () => {
    const last = { center: portland, radiusKm: 6 }
    expect(worthSearching(last, { center: east(5), radiusKm: 6 })).toBe(true)
    expect(worthSearching(last, { center: portland, radiusKm: 2 })).toBe(true)
    expect(worthSearching(last, { center: portland, radiusKm: 12 })).toBe(true)
  })

  it('knows a wide view is only searched around its middle', () => {
    expect(searchArea({ center: portland, radiusKm: 60 }).radiusKm).toBe(15)
    // Zooming between two wide views changes nothing that would be searched.
    const last = searchArea({ center: portland, radiusKm: 60 })
    expect(worthSearching(last, { center: portland, radiusKm: 40 })).toBe(false)
  })
})
