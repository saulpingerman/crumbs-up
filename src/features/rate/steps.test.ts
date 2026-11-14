import { describe, expect, it } from 'vitest'
import { QUESTIONS, TASTING_ORDER, type Answers } from '@/lib/rubric'
import { todayIso } from '@/lib/format'
import {
  QUESTION_COUNT,
  categoryProgress,
  cleanPrice,
  furthestStep,
  stepsFor,
  validateDetails,
} from './steps'
import { blankDraft } from './useDraft'

const DETAILS = { cookieType: 'Snickerdoodle', bakery: 'Corner Market', state: 'PA' }

function draft(patch: Partial<ReturnType<typeof blankDraft>> = {}) {
  const blank = blankDraft('new')
  return { ...blank, details: { ...blank.details, ...DETAILS }, ...patch }
}

describe('the ways to rate', () => {
  it('a quick review is the details, three questions and the verdict', () => {
    const steps = stepsFor({ manual: null, quick: true })
    expect(steps.map((step) => step.kind)).toEqual([
      'details',
      'question',
      'question',
      'question',
      'summary',
    ])
    expect(QUESTION_COUNT.quick).toBe(3)
  })

  it('a full tasting asks every question and shows each score on the way', () => {
    const steps = stepsFor({ manual: null, quick: false })
    const asked = TASTING_ORDER.reduce((n, category) => n + QUESTIONS[category].length, 0)
    expect(QUESTION_COUNT.full).toBe(asked)
    expect(steps.filter((step) => step.kind === 'result')).toHaveLength(3)
    expect(steps.length).toBeGreaterThan(stepsFor({ manual: null, quick: true }).length)
  })

  it('typing the scores in skips the questions either way', () => {
    const manual = { taste: 7, texture: 7, appearance: 7 }
    for (const quick of [true, false]) {
      expect(stepsFor({ manual, quick }).map((step) => step.kind)).toEqual(['details', 'summary'])
    }
  })
})

describe('how far a quick review has got', () => {
  const steps = stepsFor({ manual: null, quick: true })

  it('waits on the first question nobody has answered', () => {
    expect(furthestStep(steps, draft({ quick: true }))).toBe(1)
    expect(
      furthestStep(steps, draft({ quick: true, answers: { 'quick.look': 'quick.look.4' } })),
    ).toBe(2)
  })

  it('reaches the verdict once all three are in', () => {
    const answers: Answers = {
      'quick.look': 'quick.look.4',
      'quick.bite': 'quick.bite.5',
      'quick.taste': 'quick.taste.6',
    }
    expect(furthestStep(steps, draft({ quick: true, answers }))).toBe(steps.length - 1)
  })

  it('is not moved along by answers from the full tasting', () => {
    const answers: Answers = { 'look.appeal': 'look.appeal.4' }
    expect(furthestStep(steps, draft({ quick: true, answers }))).toBe(1)
  })

  it("fills a category's bar with its one answer", () => {
    const answers: Answers = { 'quick.bite': 'quick.bite.5' }
    expect(categoryProgress('texture', answers, true)).toBe(1)
    expect(categoryProgress('taste', answers, true)).toBe(0)
    expect(categoryProgress('texture', answers)).toBe(0)
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
