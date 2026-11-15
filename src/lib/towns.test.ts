import { describe, expect, it } from 'vitest'
import { PlaceIndex } from './places'
import { bigTownsToTry, countTowns, newTowns, townKey, townLabel } from './towns'

/** A handful of central Pennsylvania, and one place a long way off. */
const index = new PlaceIndex({
  PA: [
    ['State College', 40.7934, -77.86, 42000],
    ['Altoona', 40.5187, -78.3947, 43000],
    ['Bellefonte', 40.9134, -77.7783, 6200],
    ['Boalsburg', 40.7756, -77.7925, 4000],
    ['Lewistown', 40.5992, -77.5714, 8200],
    ['Park Forest Village', 40.8065, -77.9172, 9600],
    ['Pine Grove Mills', 40.7337, -77.8853, 1500],
    ['Philadelphia', 39.9526, -75.1652, 1600000],
  ],
})

describe('towns', () => {
  it('treats one town as one town however it was typed', () => {
    expect(townKey({ city: 'St. Louis', state: 'MO' })).toBe(
      townKey({ city: ' saint louis ', state: 'MO' }),
    )
    expect(townKey({ city: 'Portland', state: 'OR' })).not.toBe(
      townKey({ city: 'Portland', state: 'ME' }),
    )
    expect(townKey({ city: '  ', state: 'PA' })).toBe('')
  })

  it('names a town with its state, unless it is abroad', () => {
    expect(townLabel({ city: 'State College', state: 'PA' })).toBe('State College, PA')
    expect(townLabel({ city: 'Paris', state: 'XX' })).toBe('Paris')
  })

  it('counts the towns a journal covers, not the cookies with no town', () => {
    expect(
      countTowns([
        { city: 'State College', state: 'PA' },
        { city: 'state college', state: 'PA' },
        { city: 'Bellefonte', state: 'PA' },
        { city: '', state: 'PA' },
      ]),
    ).toBe(2)
  })
})

describe('new territory', () => {
  const home = { city: 'State College', state: 'PA', place: null }

  it('suggests towns near the ones in the journal, nearest and biggest first', () => {
    const towns = newTowns([home], index)
    expect(towns.map((t) => t.name)).toEqual(['Boalsburg', 'Bellefonte', 'Altoona', 'Lewistown'])
    expect(towns[0]).toMatchObject({ state: 'PA', from: 'State College' })
    expect(towns[1]!.km).toBeGreaterThan(10)
    expect(towns[1]!.km).toBeLessThan(20)
  })

  it('leaves out towns already in the journal, their suburbs, hamlets and far-off cities', () => {
    const names = newTowns([home, { city: 'Bellefonte', state: 'PA', place: null }], index).map(
      (t) => t.name,
    )
    expect(names).not.toContain('State College')
    expect(names).not.toContain('Bellefonte')
    // Three miles out of town is still town.
    expect(names).not.toContain('Park Forest Village')
    expect(names).not.toContain('Pine Grove Mills')
    expect(names).not.toContain('Philadelphia')
  })

  it('knows where a cookie was from its pinned spot when no town was typed', () => {
    const pinned = { city: '', state: 'PA', place: { lat: 40.794, lng: -77.861 } }
    expect(newTowns([pinned], index).map((t) => t.name)).not.toContain('State College')
    expect(newTowns([pinned], index)[0]!.from).toBe('State College')
  })

  it('has nothing to suggest for a journal it cannot place', () => {
    expect(newTowns([], index)).toEqual([])
    expect(newTowns([{ city: 'Nowhereville', state: 'PA', place: null }], index)).toEqual([])
  })
})

describe('a state’s towns to look round', () => {
  it('lists its biggest towns that have no cookie yet', () => {
    const towns = bigTownsToTry(
      [{ city: 'Philadelphia', state: 'PA', place: null }],
      index,
      'PA',
      3,
    )
    expect(towns.map((t) => t.name)).toEqual(['Altoona', 'State College', 'Park Forest Village'])
  })

  it('has none for a state it knows no towns in', () => {
    expect(bigTownsToTry([], index, 'OR')).toEqual([])
  })
})
