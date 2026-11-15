import { describe, expect, it } from 'vitest'
import {
  communityTowns,
  fromRows,
  inTown,
  rankBakeries,
  rankCookies,
  rankTypes,
  sameCookie,
  type CommunityRow,
} from './community'

const row = (patch: Partial<CommunityRow>): CommunityRow => ({
  cookie_type: 'Chocolate Chip',
  bakery: 'Flour & Salt',
  city: 'Portland',
  state: 'OR',
  raters: 1,
  taste: 7,
  texture: 7,
  appearance: 7,
  ...patch,
})

describe('reading the totals', () => {
  it('works out the overall as the plain average of the three', () => {
    const [cookie] = fromRows([row({ taste: 9, texture: 8, appearance: '7.00' })])
    expect(cookie!.scores).toEqual({ taste: 9, texture: 8, appearance: 7 })
    expect(cookie!.overall).toBe(8)
  })

  it('drops rows that do not hold together', () => {
    expect(
      fromRows([
        row({ cookie_type: '' }),
        row({ raters: 0 }),
        row({ taste: 'lots' }),
        row({ taste: 14 }),
        row({}),
      ]),
    ).toHaveLength(1)
    expect(fromRows(null)).toEqual([])
    expect(fromRows({ message: 'no such function' })).toEqual([])
  })
})

describe('ordering the list', () => {
  it('does not let one perfect score outrank a great cookie many agree on', () => {
    const ranked = rankCookies(
      fromRows([
        row({ cookie_type: 'One Fan', raters: 1, taste: 10, texture: 10, appearance: 10 }),
        row({ cookie_type: 'Crowd Favourite', raters: 20, taste: 9, texture: 9, appearance: 9 }),
        row({ cookie_type: 'Fine', raters: 20, taste: 6, texture: 6, appearance: 6 }),
      ]),
    )
    expect(ranked.map((c) => c.cookieType)).toEqual(['Crowd Favourite', 'One Fan', 'Fine'])
    // The number shown is still the real average, not the one it was sorted by.
    expect(ranked[1]!.overall).toBe(10)
  })

  it('puts the cookie more people rated first when the scores are level', () => {
    const ranked = rankCookies(
      fromRows([
        row({ cookie_type: 'Two People', raters: 2 }),
        row({ cookie_type: 'Five People', raters: 5 }),
      ]),
    )
    expect(ranked[0]!.cookieType).toBe('Five People')
  })
})

describe('grouping', () => {
  const cookies = fromRows([
    row({ cookie_type: 'Chocolate Chip', raters: 3, taste: 9, texture: 9, appearance: 9 }),
    row({ cookie_type: 'Snickerdoodle', raters: 1, taste: 5, texture: 5, appearance: 5 }),
    row({
      cookie_type: 'chocolate chip',
      bakery: 'Rise',
      city: 'Bend',
      raters: 2,
      taste: 6,
      texture: 6,
      appearance: 6,
    }),
  ])

  it('judges a bakery on everything rated there, every rating counting once', () => {
    const [first, second] = rankBakeries(cookies)
    expect(first).toMatchObject({ name: 'Flour & Salt', place: 'Portland, OR', cookies: 2 })
    expect(first!.ratings).toBe(4)
    // (9 × 3 + 5 × 1) / 4
    expect(first!.overall).toBe(8)
    expect(first!.best.cookieType).toBe('Chocolate Chip')
    expect(second).toMatchObject({ name: 'Rise', place: 'Bend, OR', cookies: 1, ratings: 2 })
  })

  it('compares kinds of cookie across bakeries, however the kind was capitalised', () => {
    const types = rankTypes(cookies)
    expect(types.map((t) => t.name)).toEqual(['Chocolate Chip', 'Snickerdoodle'])
    expect(types[0]).toMatchObject({ cookies: 2, ratings: 5 })
    // (9 × 3 + 6 × 2) / 5
    expect(types[0]!.overall).toBeCloseTo(7.8)
  })

  it('narrows to one town', () => {
    expect(communityTowns(cookies).map((t) => t.label)).toEqual(['Bend, OR', 'Portland, OR'])
    const bend = communityTowns(cookies)[0]!.key
    expect(inTown(cookies, bend).map((c) => c.bakery)).toEqual(['Rise'])
    expect(inTown(cookies, '')).toHaveLength(3)
  })
})

describe('matching a journal', () => {
  it('knows a cookie in the totals is one someone has rated themselves', () => {
    const [cookie] = fromRows([row({})])
    expect(
      sameCookie(cookie!, {
        cookieType: 'chocolate chip ',
        bakery: 'FLOUR & SALT',
        city: 'portland',
        state: 'OR',
      }),
    ).toBe(true)
    expect(
      sameCookie(cookie!, {
        cookieType: 'Chocolate Chip',
        bakery: 'Flour & Salt',
        city: 'Portland',
        state: 'ME',
      }),
    ).toBe(false)
  })
})
