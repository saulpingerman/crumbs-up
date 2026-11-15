import { describe, expect, it } from 'vitest'
import { COOKIE_KINDS, kindOf } from './cookie-kinds'
import { recommend } from './recommend'
import type { RatedCookie } from './stats'

let n = 0
function cookie(
  cookieType: string,
  overall: number,
  patch: Partial<RatedCookie> = {},
): RatedCookie {
  n += 1
  return {
    id: `c${n}`,
    createdAt: n,
    updatedAt: n,
    eatenOn: '2026-01-01',
    cookieType,
    bakery: `Bakery ${n}`,
    city: 'Portland',
    state: 'OR',
    price: null,
    place: null,
    notes: '',
    answers: {},
    suggested: { taste: overall, texture: overall, appearance: overall },
    scores: { taste: overall, texture: overall, appearance: overall },
    rubricVersion: 1,
    hasPhoto: false,
    overall,
    overallExact: overall,
    ...patch,
  }
}

describe('kindOf', () => {
  it('recognizes cookies however they are named', () => {
    const cases: [string, string][] = [
      ['Chocolate Chip', 'chocolate-chip'],
      ['Brown Butter Sea Salt Chocolate Chunk', 'brown-butter'],
      ['Oatmeal Raisin', 'oatmeal-raisin'],
      ['Oatmeal Chocolate Chip', 'oatmeal-chocolate'],
      ['PB Chocolate Chip', 'pb-chocolate'],
      ['Peanut Butter', 'peanut-butter'],
      ['Lemon Crinkle', 'lemon'],
      ['Chocolate Crinkle', 'crinkle'],
      ['Double Chocolate', 'double-chocolate'],
      ['Snickerdoodle', 'snickerdoodle'],
      ['Gingersnap', 'gingersnap'],
      ['Molasses Ginger', 'molasses'],
      ['White Chocolate Macadamia', 'white-macadamia'],
      ['S’mores', 'smores'],
      ['Birthday Cake', 'birthday'],
      ['Sugar', 'sugar'],
      ['Shortbread', 'shortbread'],
      ['Salted Caramel', 'salted-caramel'],
    ]
    for (const [typed, id] of cases) expect(kindOf(typed)?.id, typed).toBe(id)
    expect(kindOf('Grandma’s Special')).toBeUndefined()
  })

  it('has unique ids and at least one trait per kind', () => {
    expect(new Set(COOKIE_KINDS.map((k) => k.id)).size).toBe(COOKIE_KINDS.length)
    for (const kind of COOKIE_KINDS) expect(kind.traits.length, kind.id).toBeGreaterThan(0)
  })
})

describe('recommend', () => {
  it('starts with the classics before it knows your taste', () => {
    const result = recommend([cookie('Chocolate Chip', 7)])
    expect(result.personal).toBe(false)
    expect(result.likes).toEqual([])
    expect(result.tryNext.length).toBeGreaterThan(0)
    expect(result.tryNext.every((p) => p.kind.classic)).toBe(true)
    expect(result.tryNext.every((p) => p.because.length === 0)).toBe(true)
    // …and never something already tried.
    expect(result.tryNext.map((p) => p.kind.id)).not.toContain('chocolate-chip')
  })

  const caramelFan = [
    cookie('Brown Butter Chocolate Chip', 9.5),
    cookie('Salted Caramel', 9),
    cookie('Molasses Ginger', 8.5),
    cookie('Birthday Cake', 4),
    cookie('Sugar', 5),
    cookie('Cookies & Cream', 4.5),
  ]

  it('reads a palate from what the best and worst cookies have in common', () => {
    const result = recommend(caramelFan)
    expect(result.personal).toBe(true)
    expect(result.likes.map((t) => t.trait)).toContain('caramel')
    expect(result.dislikes.map((t) => t.trait)).toContain('playful')
    expect(result.likes.find((t) => t.trait === 'caramel')?.example.cookieType).toBe(
      'Brown Butter Chocolate Chip',
    )
  })

  it('suggests untried kinds that play to those tastes, and says why', () => {
    const result = recommend(caramelFan)
    const ids = result.tryNext.map((p) => p.kind.id)
    // More caramel, please; fewer sprinkles.
    expect(
      ids.some((id) => ['biscoff', 'florentine', 'alfajor', 'kitchen-sink'].includes(id)),
    ).toBe(true)
    expect(ids).not.toContain('monster')
    expect(ids).not.toContain('salted-caramel') // already tried
    const top = result.tryNext[0]!
    expect(top.because.length).toBeGreaterThan(0)
    expect(top.because.every((t) => top.kind.traits.includes(t.trait))).toBe(true)
  })

  it('offers a second chance at a kind that should suit you but disappointed', () => {
    const result = recommend([...caramelFan, cookie('Toffee Crunch', 9), cookie('Biscoff', 4)])
    expect(result.secondChances.map((s) => s.kind.id)).toContain('biscoff')
  })

  it('uses how a cookie actually ate, when the questionnaire recorded it', () => {
    const chewy = { [`bite.style`]: 'bite.style.chewy' }
    const crisp = { [`bite.style`]: 'bite.style.crisp' }
    const result = recommend([
      cookie('Chocolate Chip', 9, { answers: chewy }),
      cookie('Sugar', 8.5, { answers: chewy }),
      cookie('Chocolate Chip', 4, { answers: crisp }),
      cookie('Shortbread', 4.5, { answers: crisp }),
    ])
    expect(result.likes.map((t) => t.trait)).toContain('chewy')
    expect(result.dislikes.map((t) => t.trait)).toContain('crisp')
  })

  it('points back to great bakeries that have only been sampled', () => {
    const result = recommend([
      cookie('Chocolate Chip', 9, { bakery: 'Butter & Ember' }),
      cookie('Sugar', 5, { bakery: 'Corner Mart' }),
      cookie('Snickerdoodle', 8.5, { bakery: 'Regulars' }),
      cookie('Lemon', 8.5, { bakery: 'Regulars' }),
      cookie('Peanut Butter', 8.5, { bakery: 'Regulars' }),
    ])
    expect(result.returnTrips.map((t) => t.bakery)).toEqual(['Butter & Ember'])
    expect(result.returnTrips[0]).toMatchObject({ count: 1, average: 9 })
  })

  it('copes with an empty journal', () => {
    const result = recommend([])
    expect(result.personal).toBe(false)
    expect(result.tryNext.length).toBeGreaterThan(0)
    expect(result.returnTrips).toEqual([])
  })
})
