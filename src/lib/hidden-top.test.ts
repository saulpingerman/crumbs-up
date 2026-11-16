import { describe, expect, it } from 'vitest'
import type { CommunityCookie } from '@/lib/community'
import { bakeryKey, cookieKey, typeKey } from '@/lib/community'
import { parseHidden, withoutHidden } from './hidden-top'

const scores = { taste: 7, texture: 7, appearance: 7 }
const entry = (cookieType: string, bakery: string, city = 'Portland', state = 'OR') =>
  ({ cookieType, bakery, city, state, raters: 1, scores, overall: 7 }) as CommunityCookie

const list = [
  entry('Chocolate Chip', 'Rise & Shine'),
  entry('Oatmeal Raisin', 'Rise & Shine'),
  entry('Chocolate Chip', 'Butter & Ember'),
  entry('Chocolate Chip', 'Rise & Shine', 'Salem'),
]

describe('hiding entries from Top rated', () => {
  it('hides one cookie at one bakery, however its name was typed', () => {
    const left = withoutHidden(list, [
      { kind: 'cookie', key: cookieKey(entry(' chocolate chip', 'RISE & SHINE ')) },
    ])
    expect(left).toHaveLength(3)
    expect(left).not.toContainEqual(list[0])
  })

  it('hides a whole bakery in its town, and only there', () => {
    const left = withoutHidden(list, [{ kind: 'bakery', key: bakeryKey(list[0]!) }])
    expect(left.map((c) => `${c.bakery} ${c.city}`)).toEqual([
      'Butter & Ember Portland',
      'Rise & Shine Salem',
    ])
  })

  it('hides a whole kind of cookie everywhere', () => {
    const left = withoutHidden(list, [{ kind: 'type', key: typeKey(list[0]!) }])
    expect(left.map((c) => c.cookieType)).toEqual(['Oatmeal Raisin'])
  })

  it('reads back only what it wrote', () => {
    expect(parseHidden(null)).toEqual([])
    expect(parseHidden('not json')).toEqual([])
    expect(parseHidden('{"kind":"cookie"}')).toEqual([])
    expect(
      parseHidden('[{"kind":"cookie","key":"a"},{"kind":"user","key":"b"},{"key":3}]'),
    ).toEqual([{ kind: 'cookie', key: 'a' }])
  })
})
