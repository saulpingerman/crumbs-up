import { describe, expect, it } from 'vitest'
import type { CookieRecord } from './db/schema'
import { QUESTIONS, type Answers, type Scores } from './rubric'
import { disagreement } from './stats'

/** Every question answered with the "standard" rung, so each suggestion is 5. */
function fullAnswers(): Answers {
  const answers: Answers = {}
  for (const questions of Object.values(QUESTIONS)) {
    for (const q of questions) {
      if (q.kind === 'flaws') answers[q.id] = []
      else answers[q.id] = q.options[q.kind === 'scale' ? 2 : 0]!.id
    }
  }
  return answers
}

function cookie(scores: Scores, answers: Answers = fullAnswers()): CookieRecord {
  return {
    id: crypto.randomUUID(),
    createdAt: 0,
    updatedAt: 0,
    eatenOn: '2026-01-01',
    cookieType: 'Sugar',
    bakery: 'B',
    city: '',
    state: 'OR',
    price: null,
    place: null,
    notes: '',
    answers,
    suggested: { taste: 5, texture: 5, appearance: 5 },
    scores,
    rubricVersion: 1,
    hasPhoto: false,
  }
}

describe('disagreement', () => {
  it('averages how far the final scores sit from the suggestions', () => {
    const result = disagreement([
      cookie({ taste: 6, texture: 5, appearance: 4.5 }),
      cookie({ taste: 5.5, texture: 5, appearance: 5 }),
      cookie({ taste: 5, texture: 5, appearance: 4.5 }),
    ])
    expect(result.count).toBe(3)
    expect(result.byCategory.taste).toEqual({ average: 0.5, moved: 2 })
    expect(result.byCategory.texture).toEqual({ average: 0, moved: 0 })
    expect(result.byCategory.appearance.average).toBeCloseTo(-1 / 3)
    expect(result.byCategory.appearance.moved).toBe(2)
  })

  it('leaves out cookies whose scores were typed in by hand', () => {
    const result = disagreement([
      cookie({ taste: 9, texture: 9, appearance: 9 }, {}),
      cookie({ taste: 5, texture: 5, appearance: 5 }),
    ])
    expect(result.count).toBe(1)
    expect(result.byCategory.taste.average).toBe(0)
  })

  it('copes with nothing to compare', () => {
    expect(disagreement([]).count).toBe(0)
    expect(disagreement([]).byCategory.taste).toEqual({ average: 0, moved: 0 })
  })
})
