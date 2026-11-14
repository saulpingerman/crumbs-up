import { describe, expect, it } from 'vitest'
import type { Bounds } from '@/lib/geo'
import { searchBounds, worthSearching, type Viewed } from './nearby'

/** A view `size` degrees across, centred on Portland and shifted east by `shift`. */
function view(size: number, shift = 0, radiusKm = 8): Viewed {
  const bounds: Bounds = {
    south: 45.52 - size / 2,
    north: 45.52 + size / 2,
    west: -122.67 - size / 2 + shift,
    east: -122.67 + size / 2 + shift,
  }
  return { bounds, radiusKm }
}

describe('searching the map by itself', () => {
  it('searches the first view it is shown', () => {
    expect(worthSearching(null, view(0.2))).toBe(true)
  })

  it('does not search a view that takes in half a state', () => {
    expect(worthSearching(null, view(4, 0, 200))).toBe(false)
  })

  it('covers the whole view and a margin round it', () => {
    const { bounds } = view(0.2)
    const searched = searchBounds(view(0.2))
    expect(searched.west).toBeLessThan(bounds.west)
    expect(searched.east).toBeGreaterThan(bounds.east)
    expect(searched.south).toBeLessThan(bounds.south)
    expect(searched.north).toBeGreaterThan(bounds.north)
  })

  it('lets a nudge of the map go by', () => {
    const last = { bounds: searchBounds(view(0.2)), complete: true }
    expect(worthSearching(last, view(0.2, 0.01))).toBe(false)
  })

  it('searches again once the view leaves the ground already covered', () => {
    const last = { bounds: searchBounds(view(0.2)), complete: true }
    expect(worthSearching(last, view(0.2, 0.1))).toBe(true)
    expect(worthSearching(last, view(0.4))).toBe(true)
  })

  it('has nothing to add when zooming in on a search that found everything', () => {
    const last = { bounds: searchBounds(view(0.2)), complete: true }
    expect(worthSearching(last, view(0.05))).toBe(false)
  })

  it('looks again, closer in, when the last search was cut short', () => {
    const last = { bounds: searchBounds(view(0.2)), complete: false }
    expect(worthSearching(last, view(0.05))).toBe(true)
    // A slight zoom would only be cut short the same way.
    expect(worthSearching(last, view(0.19))).toBe(false)
  })
})
