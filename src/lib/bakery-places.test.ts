import { describe, expect, it } from 'vitest'
import { bakeryPlaces, fromSamePlace, rateHereLink, yourPlaces } from './bakery-places'
import { formatPlace } from './format'
import { countTowns } from './towns'
import type { CookieRecord } from './db/schema'
import { rate } from './stats'

let made = 0
function cookie(patch: Partial<CookieRecord>): CookieRecord {
  made += 1
  return {
    id: `c${made}`,
    createdAt: made,
    updatedAt: made,
    eatenOn: '2026-01-01',
    cookieType: 'Sugar',
    bakery: 'Flour & Salt',
    city: 'Portland',
    state: 'OR',
    price: null,
    place: null,
    notes: '',
    answers: {},
    suggested: { taste: 5, texture: 5, appearance: 5 },
    scores: { taste: 5, texture: 5, appearance: 5 },
    rubricVersion: 2,
    hasPhoto: false,
    ...patch,
  }
}
const weights = { taste: 2, texture: 2, appearance: 1 }

describe('your places', () => {
  it('counts each bakery in each town once, however its name was typed, newest first', () => {
    const places = yourPlaces(
      rate(
        [
          cookie({ eatenOn: '2026-03-01' }),
          cookie({ bakery: 'flour & salt ', eatenOn: '2026-05-01' }),
          cookie({ bakery: 'Flour & Salt', city: 'Salem', eatenOn: '2026-04-01' }),
          cookie({ bakery: 'Lowell', eatenOn: '2026-02-01' }),
        ],
        weights,
        'half',
      ),
    )
    expect(places.map((p) => [p.bakery, p.city, p.cookies])).toEqual([
      ['Flour & Salt', 'Portland', 2],
      ['Flour & Salt', 'Salem', 1],
      ['Lowell', 'Portland', 1],
    ])
  })

  it('carries a pin from whichever of its cookies has one', () => {
    const pin = { lat: 45.52, lng: -122.68 }
    const [place] = yourPlaces(
      rate(
        [cookie({ eatenOn: '2026-05-01' }), cookie({ eatenOn: '2026-01-01', place: pin })],
        weights,
        'half',
      ),
    )
    expect(place!.place).toEqual(pin)
  })
})

describe('the same place', () => {
  it('finds the other cookies from it, best first, and not the cookie itself', () => {
    const rated = rate(
      [
        cookie({ id: 'me' }),
        cookie({ id: 'good', scores: { taste: 9, texture: 9, appearance: 9 } }),
        cookie({ id: 'fine', bakery: 'FLOUR & SALT' }),
        cookie({ id: 'elsewhere', city: 'Salem' }),
      ],
      weights,
      'half',
    )
    const me = rated.find((c) => c.id === 'me')!
    expect(fromSamePlace(me, rated).map((c) => c.id)).toEqual(['good', 'fine'])
  })

  it('links a new rating to it, pin and all', () => {
    const link = rateHereLink({
      bakery: 'Flour & Salt',
      city: 'Portland',
      state: 'OR',
      place: { lat: 45.5, lng: -122.6 },
    })
    const params = new URL(link, 'https://crumbs-up.com').searchParams
    expect(Object.fromEntries(params)).toEqual({
      bakery: 'Flour & Salt',
      city: 'Portland',
      state: 'OR',
      lat: '45.5',
      lng: '-122.6',
    })
  })
})

describe('an online shop', () => {
  it('reads as online, with the area it serves if one was given', () => {
    expect(formatPlace({ city: '', state: 'WW', online: true })).toBe('Online')
    expect(formatPlace({ city: 'Bucks County', state: 'PA', online: true })).toBe(
      'Online · Bucks County, PA',
    )
    expect(formatPlace({ city: '', state: 'PA', online: true })).toBe('Online · Pennsylvania')
  })

  it('is kept off the map, and out of the towns counted', () => {
    const rated = rate(
      [cookie({ online: true, city: 'Portland' }), cookie({ bakery: 'Lowell' })],
      weights,
      'half',
    )
    expect(bakeryPlaces(rated, null).map((p) => p.bakery)).toEqual(['Lowell'])
    expect(countTowns(rated)).toBe(1)
  })

  it('stays online when a new cookie is rated there', () => {
    const [place] = yourPlaces(rate([cookie({ online: true })], weights, 'half'))
    expect(place!.online).toBe(true)
    expect(rateHereLink(place!)).toContain('online=1')
    expect(rateHereLink(place!)).not.toContain('lat=')
  })
})
