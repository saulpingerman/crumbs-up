import { afterEach, describe, expect, it, vi } from 'vitest'
import { bakeriesWithin, cookieShopsWithin, formatMiles, parsePhoton } from './osm'

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

describe('bakeries across a stretch of map', () => {
  const bounds = { south: 45.4, north: 45.6, west: -122.8, east: -122.5 }

  /** A made-up bakery from the search service, `n` of them spread over the rectangle. */
  const feature = (id: number, lat: number, lng: number) => ({
    properties: {
      osm_type: 'N',
      osm_id: id,
      osm_key: 'shop',
      osm_value: 'bakery',
      name: `Bakery ${id}`,
      state: 'Oregon',
      countrycode: 'US',
    },
    geometry: { type: 'Point', coordinates: [lng, lat] },
  })
  const spread = (count: number, from = 0) =>
    Array.from({ length: count }, (_, i) =>
      feature(from + i, 45.41 + ((i * 7) % 18) / 100, -122.79 + ((i * 11) % 28) / 100),
    )

  /** Stand in for the service: `answer` decides what each question gets back. */
  function serve(answer: (url: URL, asked: number) => unknown[]) {
    const asked: URL[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((input: URL | string) => {
        const url = new URL(String(input))
        asked.push(url)
        const features = answer(url, asked.length)
        return Promise.resolve(new Response(JSON.stringify({ features }), { status: 200 }))
      }),
    )
    return asked
  }

  afterEach(() => vi.unstubAllGlobals())

  it('asks once for a quiet area, and for bakeries spread over it, not the nearest', async () => {
    const asked = serve(() => spread(12))
    const { places, complete } = await bakeriesWithin(bounds)
    expect(asked).toHaveLength(1)
    expect(asked[0]!.searchParams.get('distance_sort')).toBe('false')
    expect(asked[0]!.searchParams.getAll('osm_tag')).toEqual(['shop:bakery', 'shop:pastry'])
    // The circle asked about reaches the corners of the rectangle.
    expect(Number(asked[0]!.searchParams.get('radius'))).toBeGreaterThanOrEqual(16)
    expect(places).toHaveLength(12)
    expect(complete).toBe(true)
  })

  it('leaves out anything outside the rectangle', async () => {
    serve(() => [feature(1, 45.5, -122.6), feature(2, 45.7, -122.6), feature(3, 45.5, -122.9)])
    const { places } = await bakeriesWithin(bounds)
    expect(places.map((p) => p.name)).toEqual(['Bakery 1'])
  })

  it('asks square by square when one answer comes back full', async () => {
    // The whole-view question gets the full fifty; each of the nine squares
    // then has a handful of its own, some of them repeats.
    const asked = serve((_url, n) => (n === 1 ? spread(50) : spread(6, 40 + n * 3)))
    const { places, complete } = await bakeriesWithin(bounds)
    expect(asked).toHaveLength(10)
    expect(new Set(places.map((p) => p.id)).size).toBe(places.length)
    expect(places.length).toBeGreaterThan(50)
    expect(complete).toBe(true)
  })

  it('says so when even a square has more than it could list', async () => {
    serve((_url, n) => spread(50, n * 100))
    const { complete } = await bakeriesWithin(bounds)
    expect(complete).toBe(false)
  })

  it('asks about an area too wide for one question in squares from the start', async () => {
    // About 180 km corner to corner: further than the service will look from one point.
    const wide = { south: 40.4, north: 41.4, west: -78.6, east: -76.9 }
    const asked = serve(() => [feature(1, 40.8, -77.86)])
    const { places, complete } = await bakeriesWithin(wide)
    expect(asked).toHaveLength(9)
    for (const url of asked) expect(Number(url.searchParams.get('radius'))).toBeLessThanOrEqual(50)
    // The same bakery turned up by several squares is still one bakery.
    expect(places).toHaveLength(1)
    expect(complete).toBe(true)
  })

  it('finds a whole state’s cookie shops by name, in one question', async () => {
    const asked = serve(() => [feature(1, 40.8, -77.86)])
    const state = { south: 39.72, north: 42.27, west: -80.52, east: -74.69 }
    const shops = await cookieShopsWithin(state)
    expect(asked).toHaveLength(1)
    const [url] = asked
    expect(url!.pathname).toBe('/api/')
    expect(url!.searchParams.get('q')).toBe('cookie')
    // West, south, east, north: the order the service wants.
    expect(url!.searchParams.get('bbox')).toBe('-80.52,39.72,-74.69,42.27')
    // Places that sell things to eat, not every shop with "cookie" on its sign.
    expect(url!.searchParams.getAll('osm_tag')).toContain('shop:bakery')
    expect(url!.searchParams.getAll('osm_tag')).not.toContain('shop')
    expect(shops).toHaveLength(1)
  })

  it('gives up cleanly when the service is down', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('busy', { status: 503 }))),
    )
    await expect(bakeriesWithin(bounds)).rejects.toThrow(/503/)
  })
})
