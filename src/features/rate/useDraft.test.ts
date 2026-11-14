import { describe, expect, it } from 'vitest'
import type { CookieRecord } from '@/lib/db/schema'
import { QUESTIONS, type Answers } from '@/lib/rubric'
import { draftFromCookie, draftScores } from './useDraft'

function cookie(patch: Partial<CookieRecord>): CookieRecord {
  return {
    id: 'c1',
    createdAt: 1,
    updatedAt: 1,
    eatenOn: '2026-11-14',
    cookieType: 'Peanut Butter',
    bakery: 'Corner Market',
    city: '',
    state: 'PA',
    price: null,
    place: null,
    notes: '',
    answers: {},
    suggested: { taste: 5, texture: 5, appearance: 5 },
    scores: { taste: 5, texture: 5, appearance: 5 },
    rubricVersion: 1,
    hasPhoto: false,
    ...patch,
  } as CookieRecord
}

const QUICK: Answers = {
  'quick.look': 'quick.look.4',
  'quick.bite': 'quick.bite.5',
  'quick.taste': 'quick.taste.5',
}

/** Every full-tasting question answered on the same rung, no flaws. */
function fullAnswers(rung: number): Answers {
  const answers: Answers = { 'bite.style': 'bite.style.chewy' }
  for (const questions of Object.values(QUESTIONS)) {
    for (const q of questions) {
      if (q.kind === 'scale') answers[q.id] = `${q.id}.${rung}`
      if (q.kind === 'flaws') answers[q.id] = []
    }
  }
  return answers
}

describe('reopening a saved cookie', () => {
  it('brings a quick review back as a quick review, fine-tuning included', () => {
    const draft = draftFromCookie(
      cookie({
        answers: QUICK,
        suggested: { appearance: 6.5, texture: 8, taste: 8 },
        scores: { appearance: 6.5, texture: 8, taste: 8.5 },
      }),
    )
    expect(draft.quick).toBe(true)
    expect(draft.manual).toBeNull()
    expect(draft.nudges).toEqual({ appearance: 0, texture: 0, taste: 0.5 })
    expect(draftScores(draft).scores).toEqual({ appearance: 6.5, texture: 8, taste: 8.5 })
  })

  it('brings a full tasting back as a full tasting', () => {
    const draft = draftFromCookie(
      cookie({
        answers: fullAnswers(5),
        suggested: { appearance: 8, texture: 8, taste: 8 },
        scores: { appearance: 8, texture: 7.5, taste: 8 },
      }),
    )
    expect(draft.quick).toBe(false)
    expect(draft.manual).toBeNull()
    expect(draft.nudges).toEqual({ appearance: 0, texture: -0.5, taste: 0 })
  })

  it('brings typed-in scores back as typed-in scores', () => {
    const scores = { appearance: 6, texture: 7, taste: 9 }
    const draft = draftFromCookie(cookie({ answers: {}, suggested: scores, scores }))
    expect(draft.quick).toBe(false)
    expect(draft.manual).toEqual(scores)
  })
})

describe('scores for a rating in progress', () => {
  it('uses whichever set of answers matches the way being rated', () => {
    const base = draftFromCookie(cookie({ answers: { ...fullAnswers(3), ...QUICK } }))
    expect(draftScores({ ...base, quick: true, manual: null }).suggested).toEqual({
      appearance: 6.5,
      texture: 8,
      taste: 8,
    })
    expect(draftScores({ ...base, quick: false, manual: null }).suggested).toEqual({
      appearance: 5,
      texture: 5,
      taste: 5,
    })
  })
})
