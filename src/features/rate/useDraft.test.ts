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

const NUMBERS: Answers = {
  'quick.look': 'quick.look.n6',
  'quick.bite': 'quick.bite.n8',
  'quick.taste': 'quick.taste.n8',
}

/** A quick review saved before numbers, on the old worded rungs. */
const OLD_QUICK: Answers = {
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
  it('brings numbers back as numbers, fine-tuning included', () => {
    const draft = draftFromCookie(
      cookie({
        answers: NUMBERS,
        suggested: { appearance: 6, texture: 8, taste: 8 },
        scores: { appearance: 6, texture: 8, taste: 8.5 },
      }),
    )
    expect(draft.manual).toBeNull()
    expect(draft.nudges).toEqual({ appearance: 0, texture: 0, taste: 0.5 })
    expect(draftScores(draft).scores).toEqual({ appearance: 6, texture: 8, taste: 8.5 })
  })

  it('still brings back a quick review saved on the old worded answers', () => {
    const draft = draftFromCookie(
      cookie({ answers: OLD_QUICK, scores: { appearance: 6.5, texture: 8, taste: 8.5 } }),
    )
    expect(draft.manual).toBeNull()
    expect(draftScores(draft).scores).toEqual({ appearance: 6.5, texture: 8, taste: 8.5 })
  })

  it('brings an old full tasting back as its scores, ready to adjust, answers kept', () => {
    const scores = { appearance: 8, texture: 7.5, taste: 8 }
    const answers = fullAnswers(5)
    const draft = draftFromCookie(cookie({ answers, suggested: scores, scores }))
    expect(draft.manual).toEqual(scores)
    expect(draft.answers).toEqual(answers)
    expect(draftScores(draft).scores).toEqual(scores)
  })

  it('brings typed-in scores back as typed-in scores', () => {
    const scores = { appearance: 6, texture: 7, taste: 9 }
    const draft = draftFromCookie(cookie({ answers: {}, suggested: scores, scores }))
    expect(draft.manual).toEqual(scores)
  })
})
