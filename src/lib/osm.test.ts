import { describe, expect, it } from 'vitest'
import { formatMiles, parsePhoton } from './osm'

/** Trimmed from real Photon responses. */
const response = {
  type: 'FeatureCollection',
  features: [
    {
      properties: {
        osm_type: 'N',
        osm_id: 12402725001,
        osm_key: 'shop',
        osm_value: 'bakery',
        housenumber: '1015',
        name: 'Dos Hermanos Bakery',
        street: 'Southeast Stark Street',
        city: 'Portland',
        state: 'OR',
        countrycode: 'US',
      },
      geometry: { type: 'Point', coordinates: [-122.6553072, 45.5193041] },
    },
    {
      properties: {
        osm_type: 'N',
        osm_id: 5,
        osm_key: 'shop',
        osm_value: 'pastry',
        name: 'Sesame Donuts',
        street: 'Southwest Park Avenue',
        city: 'Portland',
        state: 'Oregon',
        countrycode: 'US',
      },
      geometry: { type: 'Point', coordinates: [-122.6843, 45.5142] },
    },
    // A repeat of the first, a place with no name, and one abroad: all dropped.
    {
      properties: {
        osm_type: 'N',
        osm_id: 12402725001,
        name: 'Dos Hermanos Bakery',
        countrycode: 'US',
      },
      geometry: { coordinates: [-122.65, 45.51] },
    },
    {
      properties: { osm_type: 'W', osm_id: 7, countrycode: 'US' },
      geometry: { coordinates: [-122, 45] },
    },
    {
      properties: { osm_type: 'N', osm_id: 8, name: 'Boulangerie', countrycode: 'FR' },
      geometry: { coordinates: [2.35, 48.85] },
    },
  ],
}

describe('parsePhoton', () => {
  it('keeps named U.S. places and tidies their fields', () => {
    const places = parsePhoton(response)
    expect(places).toHaveLength(2)
    expect(places[0]).toEqual({
      id: 'N12402725001',
      name: 'Dos Hermanos Bakery',
      street: '1015 Southeast Stark Street',
      city: 'Portland',
      state: 'OR',
      kind: 'bakery',
      lat: 45.5193,
      lng: -122.65531,
    })
  })

  it('reads a state given by name or by code', () => {
    expect(parsePhoton(response).map((p) => p.state)).toEqual(['OR', 'OR'])
  })

  it('shrugs off anything that is not a result list', () => {
    expect(parsePhoton(null)).toEqual([])
    expect(parsePhoton({ features: 'nope' })).toEqual([])
    expect(parsePhoton({ message: 'rate limited' })).toEqual([])
  })
})

describe('formatMiles', () => {
  it('shows a decimal only for short hops', () => {
    expect(formatMiles(0.5)).toBe('0.3 mi')
    expect(formatMiles(20)).toBe('12 mi')
  })
})
