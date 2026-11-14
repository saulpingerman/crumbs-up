import { describe, expect, it } from 'vitest'
import { artFor, hash, type ArtSource } from './recipe'

function cookie(cookieType: string, answers: ArtSource['answers'] = {}, appearance = 5): ArtSource {
  return { id: 'cookie-1', cookieType, answers, scores: { taste: 5, texture: 5, appearance } }
}

const chipCount = (source: ArtSource) => artFor(source).mixIns.reduce((sum, m) => sum + m.count, 0)

describe('artFor', () => {
  it('draws the same cookie the same way every time', () => {
    const source = cookie('Chocolate Chip', { 'look.mixins': 'look.mixins.4' })
    expect(artFor(source)).toEqual(artFor(source))
    expect(artFor({ ...source, id: 'cookie-2' }).seed).not.toBe(artFor(source).seed)
  })

  it('picks a recipe from the cookie type', () => {
    expect(artFor(cookie('Chocolate Chip')).mixIns.length).toBeGreaterThan(0)
    expect(artFor(cookie('Oatmeal Raisin')).finishes).toContain('oats')
    expect(artFor(cookie('Birthday Cake')).finishes).toContain('sprinkles')
    expect(artFor(cookie('Lemon Crinkle')).finishes).toContain('powder')
    expect(artFor(cookie('Brown Butter Sea Salt Chocolate Chunk')).finishes).toContain('salt')
    // Specific names win over the generic words inside them.
    expect(artFor(cookie('Matcha White Chocolate')).dough).not.toEqual(
      artFor(cookie('White Chocolate Macadamia')).dough,
    )
    expect(artFor(cookie('Double Chocolate')).dough).not.toEqual(
      artFor(cookie('Chocolate Chip')).dough,
    )
  })

  it('falls back to a plain cookie for names it does not know', () => {
    const art = artFor(cookie('Grandma’s Special'))
    expect(art.mixIns).toEqual([])
    expect(art.cracks).toBeGreaterThan(0)
  })

  it('scales the mix-ins with how generous the review said they were', () => {
    const skimpy = chipCount(cookie('Chocolate Chip', { 'look.mixins': 'look.mixins.1' }))
    const normal = chipCount(cookie('Chocolate Chip', { 'look.mixins': 'look.mixins.3' }))
    const loaded = chipCount(cookie('Chocolate Chip', { 'look.mixins': 'look.mixins.6' }))
    expect(skimpy).toBeLessThan(normal)
    expect(normal).toBeLessThan(loaded)
    expect(chipCount(cookie('Chocolate Chip', { 'look.mixins': 'look.mixins.na' }))).toBe(0)
  })

  it('shows the flaws that were flagged', () => {
    const clean = artFor(cookie('Sugar'))
    const burnt = artFor(cookie('Sugar', { 'look.flaws': ['look.flaw.burnt'] }))
    const broken = artFor(
      cookie('Sugar', { 'look.flaws': ['look.flaw.broken', 'look.flaw.spread'] }),
    )
    expect(burnt.rim).toBeGreaterThan(clean.rim)
    expect(burnt.dough).not.toEqual(clean.dough)
    expect(broken.broken).toBe(true)
    expect(broken.spread).toBeGreaterThan(clean.spread)
    expect(clean.broken).toBe(false)
  })

  it('makes a misshapen cookie wobblier than a picture-perfect one', () => {
    const rough = artFor(cookie('Sugar', { 'look.shape': 'look.shape.1' }))
    const perfect = artFor(cookie('Sugar', { 'look.shape': 'look.shape.6' }))
    expect(rough.wobble).toBeGreaterThan(perfect.wobble)
  })

  it('uses the appearance score when there are no answers', () => {
    expect(chipCount(cookie('Chocolate Chip', {}, 9))).toBeGreaterThan(
      chipCount(cookie('Chocolate Chip', {}, 3)),
    )
  })

  it('puts pale cookies on dark tables and dark cookies on light ones', () => {
    for (let i = 0; i < 12; i++) {
      const pale = artFor({ ...cookie('Shortbread'), id: `pale-${i}` })
      const dark = artFor({ ...cookie('Double Chocolate'), id: `dark-${i}` })
      expect(['walnut', 'slate', 'blush']).toContain(pale.surface)
      expect(['marble', 'linen', 'parchment']).toContain(dark.surface)
    }
  })
})

describe('hash', () => {
  it('is stable and spreads values', () => {
    expect(hash('a')).toBe(hash('a'))
    expect(hash('a')).not.toBe(hash('b'))
  })
})
