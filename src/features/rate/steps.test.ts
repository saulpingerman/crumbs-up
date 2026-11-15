import { describe, expect, it } from 'vitest'
import type { Answers } from '@/lib/rubric'
import { todayIso } from '@/lib/format'
import { categoryProgress, cleanPrice, furthestStep, stepsFor, validateDetails } from './steps'
import { blankDraft } from './useDraft'

const DETAILS = { cookieType: 'Snickerdoodle', bakery: 'Corner Market', state: 'PA' }

function draft(patch: Partial<ReturnType<typeof blankDraft>> = {}) {
  const blank = blankDraft('new')
  return { ...blank, details: { ...blank.details, ...DETAILS }, ...patch }
}

describe('the ways to rate', () => {
  it('is the details, a number for each category, and the verdict', () => {
    const steps = stepsFor({ manual: null })
    expect(steps.map((step) => step.kind)).toEqual([
      'details',
      'question',
      'question',
      'question',
      'summary',
    ])
  })

  it('typing the scores in skips the numbers', () => {
    const manual = { taste: 7, texture: 7, appearance: 7 }
    expect(stepsFor({ manual }).map((step) => step.kind)).toEqual(['details', 'summary'])
  })
})

describe('how far a rating has got', () => {
  const steps = stepsFor({ manual: null })

  it('waits on the first category without a number', () => {
    expect(furthestStep(steps, draft())).toBe(1)
    expect(furthestStep(steps, draft({ answers: { 'quick.look': 'quick.look.n4' } }))).toBe(2)
  })

  it('reaches the verdict once all three are in', () => {
    const answers: Answers = {
      'quick.look': 'quick.look.n4',
      'quick.bite': 'quick.bite.n5',
      'quick.taste': 'quick.taste.n6',
    }
    expect(furthestStep(steps, draft({ answers }))).toBe(steps.length - 1)
  })

  it('is not moved along by answers from the old full tasting', () => {
    const answers: Answers = { 'look.appeal': 'look.appeal.4' }
    expect(furthestStep(steps, draft({ answers }))).toBe(1)
  })

  it("fills a category's bar once it has its number", () => {
    const answers: Answers = { 'quick.bite': 'quick.bite.n5' }
    expect(categoryProgress('texture', answers)).toBe(1)
    expect(categoryProgress('taste', answers)).toBe(0)
  })
})

describe('the price box', () => {
  it('reads a comma as the decimal point', () => {
    expect(cleanPrice('3,50')).toBe('3.50')
    expect(cleanPrice('12,5')).toBe('12.5')
  })

  it('keeps one decimal point and two decimal places', () => {
    expect(cleanPrice('4.5.5')).toBe('4.55')
    expect(cleanPrice('4.999')).toBe('4.99')
    expect(cleanPrice('$4.50 each')).toBe('4.50')
    expect(cleanPrice('7')).toBe('7')
    expect(cleanPrice('')).toBe('')
  })
})

describe('checking the details', () => {
  const details = { ...blankDraft('new').details, ...DETAILS }

  it('passes a cookie eaten today', () => {
    expect(validateDetails({ ...details, eatenOn: todayIso() })).toEqual({})
  })

  it('will not have a cookie eaten in the future, or in the year 206', () => {
    expect(validateDetails({ ...details, eatenOn: '2999-01-01' }).eatenOn).toBe(
      'Pick a date up to today.',
    )
    expect(validateDetails({ ...details, eatenOn: '0206-11-14' }).eatenOn).toBe(
      'Pick a date up to today.',
    )
    expect(validateDetails({ ...details, eatenOn: '' }).eatenOn).toBe('Pick a date.')
  })

  it('will not have a cookie that cost thousands', () => {
    expect(validateDetails({ ...details, price: 4.5 }).price).toBeUndefined()
    expect(validateDetails({ ...details, price: null }).price).toBeUndefined()
    expect(validateDetails({ ...details, price: 99999999 }).price).toBe('Enter a price like 4.50.')
  })
})
