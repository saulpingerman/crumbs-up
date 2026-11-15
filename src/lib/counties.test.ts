import { beforeAll, describe, expect, it } from 'vitest'
import { loadCounties, type CountyAtlas } from './counties'
import { lean, project, unproject } from './geo'

describe('counties', () => {
  let atlas: CountyAtlas
  beforeAll(async () => {
    atlas = await loadCounties()
  })

  it('knows every county and which state each is in', () => {
    expect(atlas.all.length).toBeGreaterThan(3100)
    expect(atlas.in('PA')).toHaveLength(67)
    expect(atlas.in('DE')).toHaveLength(3)
    expect(atlas.in('ZZ')).toEqual([])
  })

  it('finds the county a town is in', () => {
    expect(atlas.at({ lat: 40.7934, lng: -77.86 }, 'PA')).toMatchObject({
      name: 'Centre County',
      state: 'PA',
      fips: '42027',
    })
    expect(atlas.at({ lat: 45.5152, lng: -122.6784 }, 'OR')?.name).toBe('Multnomah County')
    expect(atlas.at({ lat: 44.4759, lng: -73.2121 }, 'VT')?.name).toBe('Chittenden County')
  })

  it('still finds it when told the wrong state, or none', () => {
    const stateCollege = { lat: 40.7934, lng: -77.86 }
    expect(atlas.at(stateCollege, 'OH')?.fips).toBe('42027')
    expect(atlas.at(stateCollege)?.fips).toBe('42027')
  })

  it('calls each kind of county what people there call it', () => {
    expect(atlas.at({ lat: 29.9511, lng: -90.0715 }, 'LA')?.name).toBe('Orleans Parish')
    expect(atlas.at({ lat: 38.9072, lng: -77.0369 }, 'DC')?.name).toBe('District of Columbia')
    // An independent city in Virginia is not in any county.
    expect(atlas.at({ lat: 38.8048, lng: -77.0469 }, 'VA')?.name).toBe('Alexandria')
    expect(atlas.at({ lat: 61.2181, lng: -149.9003 }, 'AK')?.name).toBe('Anchorage')
  })

  it('has no county for somewhere out at sea or abroad', () => {
    expect(atlas.at({ lat: 30, lng: -40 })).toBeNull()
    expect(atlas.at({ lat: 48.8566, lng: 2.3522 })).toBeNull()
  })
})

describe('standing a state upright', () => {
  it('finds a place again from where it is drawn', () => {
    const drawn = project({ lat: 40.7934, lng: -77.86 })!
    const back = unproject(drawn)!
    expect(back.lat).toBeCloseTo(40.7934, 3)
    expect(back.lng).toBeCloseTo(-77.86, 3)
  })

  it('knows the east of the country leans one way and the west the other', () => {
    const maine = lean(project({ lat: 45.2, lng: -69 })!)
    const washington = lean(project({ lat: 47.4, lng: -120.5 })!)
    const kansas = lean(project({ lat: 38.5, lng: -96.5 })!)
    // On the cone, Maine's "north" tips toward the middle of the country
    // (anticlockwise) and Washington's tips the other way.
    expect(maine).toBeLessThan(-8)
    expect(washington).toBeGreaterThan(8)
    expect(Math.abs(kansas)).toBeLessThan(1.5)
  })
})
