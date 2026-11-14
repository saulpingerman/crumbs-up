import { geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import usAtlas from 'us-atlas/states-albers-10m.json'
import { beforeAll, describe, expect, it } from 'vitest'
import { distanceKm, project } from './geo'
import { loadPlaces, normalizePlace, type PlaceIndex } from './places'
import { US_STATES } from './states'

let places: PlaceIndex
beforeAll(async () => {
  places = await loadPlaces()
})

describe('places', () => {
  it('covers every state and D.C.', () => {
    const states = new Set(places.all.map((p) => p.state))
    for (const state of US_STATES) expect(states.has(state.code), state.name).toBe(true)
  })

  it('finds a city however it is typed', () => {
    expect(places.find('Portland', 'OR')?.population).toBeGreaterThan(500_000)
    expect(places.find('  portland ', 'ME')?.state).toBe('ME')
    expect(places.find('Saint Louis', 'MO')?.name).toBe('St. Louis')
    expect(places.find('St Louis', 'MO')?.name).toBe('St. Louis')
    expect(places.find('New York', 'NY')?.name).toBe('New York City')
    expect(places.find('NYC', 'NY')?.name).toBe('New York City')
    expect(places.find('Washington', 'DC')?.name).toBe('Washington, D.C.')
    expect(places.find('Nowhereville', 'OR')).toBeUndefined()
    expect(places.find('', 'OR')).toBeUndefined()
  })

  it('suggests bigger places first, and the chosen state before others', () => {
    expect(places.search('portl').map((p) => `${p.name}, ${p.state}`)[0]).toBe('Portland, OR')
    expect(places.search('portl', 'ME')[0]).toMatchObject({ name: 'Portland', state: 'ME' })
    expect(places.search('spring', 'IL')[0]).toMatchObject({ name: 'Springfield', state: 'IL' })
    expect(places.search('p')).toEqual([])
    expect(places.search('santa f')[0]?.name).toBe('Santa Fe')
  })

  it('names the town you are standing in', () => {
    // Downtown Portland, Oregon
    expect(places.nearest({ lat: 45.5202, lng: -122.6742 })).toMatchObject({
      name: 'Portland',
      state: 'OR',
    })
    // The Shaw neighbourhood reads as Washington, not "Shaw"
    expect(places.nearest({ lat: 38.912, lng: -77.022 })?.name).toBe('Washington, D.C.')
    // A small town stays itself even with a city up the road
    expect(places.nearest({ lat: 44.465, lng: -72.685 })).toMatchObject({
      name: 'Stowe',
      state: 'VT',
    })
    // Middle of the Pacific
    expect(places.nearest({ lat: 30, lng: -150 })).toBeUndefined()
  })
})

describe('normalizePlace', () => {
  it('folds punctuation and common abbreviations', () => {
    expect(normalizePlace('St. Louis')).toBe('st louis')
    expect(normalizePlace('Saint  Louis')).toBe('st louis')
    expect(normalizePlace('Mount Pleasant')).toBe('mt pleasant')
    expect(normalizePlace('Coeur d’Alene')).toBe('coeur dalene')
  })
})

describe('map projection', () => {
  const topology = usAtlas as unknown as Topology<{ states: GeometryCollection }>
  const shapes = feature(topology, topology.objects.states).features
  const path = geoPath()

  it('lands each state’s biggest city inside that state’s outline', () => {
    for (const state of US_STATES) {
      const shape = shapes.find((f) => String(f.id) === state.fips)!
      const [[x0, y0], [x1, y1]] = path.bounds(shape)
      const biggest = places.all.find((p) => p.state === state.code)!
      const point = project(biggest)
      expect(point, `${biggest.name}, ${state.code}`).not.toBeNull()
      const [x, y] = point!
      expect(
        x >= x0 - 2 && x <= x1 + 2 && y >= y0 - 2 && y <= y1 + 2,
        `${biggest.name}, ${state.code}`,
      ).toBe(true)
    }
  })

  it('returns null for somewhere off the map', () => {
    expect(project({ lat: 51.5, lng: -0.12 })).toBeNull()
  })
})

describe('distanceKm', () => {
  it('measures a known distance', () => {
    const portland = { lat: 45.523, lng: -122.676 }
    const seattle = { lat: 47.606, lng: -122.332 }
    expect(distanceKm(portland, seattle)).toBeGreaterThan(225)
    expect(distanceKm(portland, seattle)).toBeLessThan(240)
  })
})
