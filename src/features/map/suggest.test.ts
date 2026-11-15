import { describe, expect, it } from 'vitest'
import type { BakeryPlace } from '@/lib/bakery-places'
import type { OsmPlace } from '@/lib/osm'
import { asSuggestions, essence, foldChains, notYetRated, promise, rateLink } from './suggest'

let next = 0
const shop = (name: string, city: string, patch: Partial<OsmPlace> = {}): OsmPlace => ({
  id: `N${++next}`,
  name,
  street: '1 Main Street',
  city,
  state: 'PA',
  kind: 'bakery',
  lat: 40,
  lng: -77,
  ...patch,
})

describe('telling shops apart', () => {
  it('sees through "the", "bakery", "&" and capitals', () => {
    expect(essence('The Flour & Salt Bakery')).toBe(essence('flour and salt'))
    expect(essence('Rise Bakeshop')).not.toBe(essence('Shine Bakeshop'))
  })

  it('rates a cookie shop above a doughnut shop', () => {
    expect(promise('Insomnia Cookies')).toBeGreaterThan(promise('Corner Bakery'))
    expect(promise('Corner Bakery')).toBeGreaterThan(promise('Daylight Donuts'))
  })

  it('leaves out bakeries already in the journal', () => {
    const mine = [{ bakery: 'Flour and Salt', state: 'PA' }] as BakeryPlace[]
    const found = [shop('The Flour & Salt Bakery', 'Erie'), shop('Rise', 'Erie')]
    expect(notYetRated(found, mine).map((p) => p.name)).toEqual(['Rise'])
    // The same name in another state is another shop.
    expect(notYetRated([shop('Flour & Salt', 'Akron', { state: 'OH' })], mine)).toHaveLength(1)
  })

  it('starts a rating with what is known about a place', () => {
    const link = rateLink('Rise & Shine', 'Erie', 'PA', { lat: 42.1, lng: -80.1 })
    const params = new URLSearchParams(link.split('?')[1])
    expect(link.startsWith('/rate?')).toBe(true)
    expect(Object.fromEntries(params)).toEqual({
      bakery: 'Rise & Shine',
      city: 'Erie',
      state: 'PA',
      lat: '42.1',
      lng: '-80.1',
    })
  })
})

describe('listing places to try', () => {
  it('gives each place its own line, with its address', () => {
    const [line] = asSuggestions([shop('Cookie Nook', 'Elysburg')])
    expect(line).toMatchObject({
      name: 'Cookie Nook',
      detail: '1 Main Street, Elysburg',
      shops: 1,
    })
  })

  it('folds a chain into one line naming its towns, after the one-off shops', () => {
    const lines = foldChains([
      shop('Crumbl Cookies', 'Erie'),
      shop('Laura the Cookie Lady', 'Ephrata'),
      shop('Crumbl Cookies', 'Reading'),
      shop('crumbl cookies', 'Altoona'),
      shop('Crumbl Cookies', 'York'),
      shop('Crumbl Cookies', 'Erie'),
      shop('Cookie Nook', 'Elysburg'),
    ])
    expect(lines.map((l) => l.name)).toEqual([
      'Cookie Nook',
      'Laura the Cookie Lady',
      'Crumbl Cookies',
    ])
    expect(lines[2]).toMatchObject({
      shops: 5,
      detail: '5 shops: Erie, Reading, Altoona and 1 more towns',
    })
    // Its "rate here" starts from one real shop.
    expect(lines[2]!.place.city).toBe('Erie')
  })
})
