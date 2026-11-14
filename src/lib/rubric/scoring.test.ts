import { describe, expect, it } from 'vitest'
import {
  ALL_QUESTIONS,
  ANCHORS,
  CATEGORIES,
  MAX_FLAW_PENALTY,
  QUESTIONS,
  STANDARD_OPTION_INDEX,
  QUICK_QUESTION_LIST,
  QUICK_QUESTIONS,
  WEIGHT_PRESETS,
  answersFor,
  assessAll,
  assessCategory,
  formatScore,
  getQuestion,
  isQuickReview,
  overallExact,
  overallScore,
  quickScores,
  roundToHalf,
  tierFor,
  type Answers,
  type Category,
} from './index'

/** Answer every scored question in a category with the same rung (0–5). */
function answerAll(category: Category, rung: number, into: Answers = {}): Answers {
  for (const q of QUESTIONS[category]) {
    if (q.kind === 'scale') into[q.id] = q.options[rung]!.id
    if (q.kind === 'context') into[q.id] = q.options[0]!.id
  }
  return into
}

describe('question bank', () => {
  it('has unique ids for every question, option and flaw', () => {
    const ids = ALL_QUESTIONS.flatMap((q) =>
      q.kind === 'flaws'
        ? [q.id, ...q.flaws.map((f) => f.id)]
        : [q.id, ...q.options.map((o) => o.id)],
    )
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('asks five scored questions and one flaw check per category', () => {
    for (const c of CATEGORIES) {
      expect(QUESTIONS[c].filter((q) => q.kind === 'scale')).toHaveLength(5)
      expect(QUESTIONS[c].filter((q) => q.kind === 'flaws')).toHaveLength(1)
    }
  })

  it('puts the Toll House standard at 5 on every scored question', () => {
    for (const q of ALL_QUESTIONS) {
      if (q.kind !== 'scale') continue
      expect(q.options[STANDARD_OPTION_INDEX]!.score).toBe(5)
      const scored = q.options.filter((o) => o.score !== null).map((o) => o.score)
      expect(scored).toEqual([...ANCHORS])
    }
  })

  it('keeps flaw penalties on the half-point grid', () => {
    for (const q of ALL_QUESTIONS) {
      if (q.kind !== 'flaws') continue
      for (const f of q.flaws) expect(Number.isInteger(f.penalty * 2)).toBe(true)
    }
  })
})

describe('assessCategory', () => {
  it.each(CATEGORIES)('scores an all-standard %s as exactly 5', (category) => {
    const result = assessCategory(category, answerAll(category, STANDARD_OPTION_INDEX))
    expect(result.complete).toBe(true)
    expect(result.score).toBe(5)
  })

  it.each(CATEGORIES)('reaches 10 only when every %s answer is the top rung', (category) => {
    expect(assessCategory(category, answerAll(category, 5)).score).toBe(10)
    const oneShort = answerAll(category, 5)
    const first = QUESTIONS[category].find((q) => q.kind === 'scale')!
    if (first.kind === 'scale') oneShort[first.id] = first.options[4]!.id
    expect(assessCategory(category, oneShort).score).toBeLessThan(10)
  })

  it('never goes below 1, even with the worst answers and every flaw', () => {
    for (const category of CATEGORIES) {
      const answers = answerAll(category, 0)
      for (const q of QUESTIONS[category]) {
        if (q.kind === 'flaws') answers[q.id] = q.flaws.map((f) => f.id)
      }
      const result = assessCategory(category, answers)
      expect(result.score).toBe(1)
      expect(result.penalty).toBe(MAX_FLAW_PENALTY)
    }
  })

  it('always lands on a half point between 1 and 10', () => {
    for (const category of CATEGORIES) {
      for (let seed = 0; seed < 200; seed++) {
        const answers: Answers = {}
        QUESTIONS[category].forEach((q, i) => {
          if (q.kind === 'scale') answers[q.id] = q.options[(seed * 7 + i * 13) % 6]!.id
        })
        const { score } = assessCategory(category, answers)
        expect(score).toBeGreaterThanOrEqual(1)
        expect(score).toBeLessThanOrEqual(10)
        expect(Number.isInteger(score * 2)).toBe(true)
      }
    }
  })

  it('weights heavier questions more', () => {
    const base = answerAll('taste', STANDARD_OPTION_INDEX)
    const depthUp = { ...base, 'taste.depth': 'taste.depth.6' } // weight 3
    const starUp = { ...base, 'taste.star': 'taste.star.6' } // weight 2
    expect(assessCategory('taste', depthUp).base).toBeGreaterThan(
      assessCategory('taste', starUp).base,
    )
  })

  it('subtracts flagged flaws and caps the total', () => {
    const clean = answerAll('taste', 4) // every answer at 8
    expect(assessCategory('taste', clean).score).toBe(8)

    const burnt = { ...clean, 'taste.flaws': ['taste.flaw.burnt'] }
    expect(assessCategory('taste', burnt).score).toBe(7)

    const lots = {
      ...clean,
      'taste.flaws': ['taste.flaw.burnt', 'taste.flaw.stale', 'taste.flaw.salty', 'taste.flaw.raw'],
    }
    const result = assessCategory('taste', lots)
    expect(result.penalty).toBe(MAX_FLAW_PENALTY)
    expect(result.score).toBe(8 - MAX_FLAW_PENALTY)
  })

  it('drops "doesn’t apply" answers instead of counting them as average', () => {
    const answers = answerAll('appearance', 4)
    const withNa = { ...answers, 'look.mixins': 'look.mixins.na' }
    const result = assessCategory('appearance', withNa)
    expect(result.complete).toBe(true)
    expect(result.score).toBe(8)
    expect(result.lines).toHaveLength(4)
  })

  it('reports progress and stays incomplete until every scored question is answered', () => {
    const partial: Answers = { 'taste.depth': 'taste.depth.5' }
    const result = assessCategory('taste', partial)
    expect(result.complete).toBe(false)
    expect(result.answered).toBe(1)
    expect(result.total).toBe(5)
  })

  it('ignores the unscored texture-style question', () => {
    const a = answerAll('texture', 3)
    const b = { ...a, 'bite.style': 'bite.style.sandy' }
    expect(assessCategory('texture', a).exact).toBe(assessCategory('texture', b).exact)
  })

  it('names the strongest and weakest answers', () => {
    const answers = {
      ...answerAll('taste', 3),
      'taste.depth': 'taste.depth.6',
      'taste.balance': 'taste.balance.2',
    }
    const result = assessCategory('taste', answers)
    expect(result.strongest?.question.id).toBe('taste.depth')
    expect(result.weakest?.question.id).toBe('taste.balance')
  })

  it('ignores answers that do not belong to the rubric', () => {
    const answers = { ...answerAll('taste', 2), 'taste.depth': 'not-an-option', bogus: 'x' }
    const result = assessCategory('taste', answers)
    expect(result.complete).toBe(false)
    expect(result.answered).toBe(4)
  })
})

describe('overall score', () => {
  const scores = { taste: 9, texture: 7, appearance: 6 }

  it('is the plain average with equal weights', () => {
    expect(overallExact(scores, WEIGHT_PRESETS.equal.weights)).toBeCloseTo(22 / 3)
    expect(overallScore(scores, WEIGHT_PRESETS.equal.weights)).toBe(7.5)
    expect(overallScore(scores, WEIGHT_PRESETS.equal.weights, 'tenth')).toBe(7.3)
  })

  it('leans toward taste with the other presets', () => {
    expect(overallExact(scores, WEIGHT_PRESETS.fair.weights)).toBeCloseTo(7.5)
    expect(overallExact(scores, WEIGHT_PRESETS.taste.weights)).toBeCloseTo(7.8)
  })

  it('equals the shared score when all three categories agree', () => {
    for (const preset of Object.values(WEIGHT_PRESETS)) {
      expect(overallScore({ taste: 6.5, texture: 6.5, appearance: 6.5 }, preset.weights)).toBe(6.5)
    }
  })

  it('combines a full questionnaire', () => {
    const answers: Answers = {}
    answerAll('taste', 4, answers)
    answerAll('texture', 3, answers)
    answerAll('appearance', 2, answers)
    const all = assessAll(answers)
    expect([all.taste.score, all.texture.score, all.appearance.score]).toEqual([8, 6.5, 5])
  })
})

describe('helpers', () => {
  it('rounds to the half point with ties going up', () => {
    expect(roundToHalf(7.24)).toBe(7)
    expect(roundToHalf(7.25)).toBe(7.5)
    expect(roundToHalf(7.74)).toBe(7.5)
    expect(roundToHalf(7.75)).toBe(8)
  })

  it('formats scores the way they are spoken', () => {
    expect(formatScore(7)).toBe('7')
    expect(formatScore(7.5)).toBe('7.5')
    expect(formatScore(7, 'tenth')).toBe('7.0')
  })

  it('names the tiers around the standard', () => {
    expect(tierFor(5).name).toBe('Standard')
    expect(tierFor(5.5).name).toBe('Standard')
    expect(tierFor(4.5).name).toBe('Below standard')
    expect(tierFor(10).name).toBe('Perfect')
    expect(tierFor(1).name).toBe('Skip it')
  })
})

describe('quick review', () => {
  const quick: Answers = {
    'quick.look': 'quick.look.4',
    'quick.bite': 'quick.bite.5',
    'quick.taste': 'quick.taste.6',
  }

  it('asks one question per category, on the same rungs as the full tasting', () => {
    expect(QUICK_QUESTION_LIST.map((q) => q.category)).toEqual(['appearance', 'texture', 'taste'])
    for (const category of CATEGORIES) {
      const question = QUICK_QUESTIONS[category]
      expect(question.category).toBe(category)
      expect(question.options.map((o) => o.score)).toEqual([...ANCHORS])
      expect(getQuestion(question.id)).toBe(question)
    }
  })

  it('takes each answer at face value', () => {
    expect(quickScores(quick)).toEqual({ appearance: 6.5, texture: 8, taste: 10 })
  })

  it('leaves a category nobody has answered at the standard', () => {
    expect(quickScores({ 'quick.taste': 'quick.taste.5' })).toEqual({
      appearance: 5,
      texture: 5,
      taste: 8,
    })
    expect(quickScores({ 'quick.taste': 'not an option' }).taste).toBe(5)
  })

  it('counts as a quick review only once all three are answered', () => {
    expect(isQuickReview(quick)).toBe(true)
    expect(isQuickReview({ 'quick.look': 'quick.look.4', 'quick.bite': 'quick.bite.5' })).toBe(
      false,
    )
    expect(isQuickReview({})).toBe(false)
  })

  it('does not count towards the full tasting', () => {
    for (const category of CATEGORIES) {
      const assessed = assessCategory(category, quick)
      expect(assessed.answered).toBe(0)
      expect(assessed.complete).toBe(false)
    }
    expect(ALL_QUESTIONS.some((q) => q.id.startsWith('quick.'))).toBe(false)
  })

  it('keeps the two sets of answers apart', () => {
    const full = answerAll('taste', 4)
    const both = { ...full, ...quick }
    expect(answersFor(both, 'quick')).toEqual(quick)
    expect(answersFor(both, 'full')).toEqual(full)
  })
})
