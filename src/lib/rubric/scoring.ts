import { MAX_FLAW_PENALTY, QUESTIONS, QUICK_QUESTIONS, isQuickAnswer } from './questions'
import {
  CATEGORIES,
  type Answers,
  type Category,
  type Flaw,
  type Option,
  type ScaleQuestion,
  type Scores,
} from './types'

export const MIN_SCORE = 1
export const MAX_SCORE = 10
export const STANDARD_SCORE = 5

export function clampScore(n: number): number {
  return Math.min(MAX_SCORE, Math.max(MIN_SCORE, n))
}

/** Round to the nearest half point, ties going up (7.25 -> 7.5). */
export function roundToHalf(n: number): number {
  return Math.round(n * 2 + Number.EPSILON) / 2
}

export function roundToTenth(n: number): number {
  return Math.round(n * 10 + Number.EPSILON) / 10
}

export interface AnswerLine {
  question: ScaleQuestion
  option: Option
  /** Anchor score of the chosen option (never null — N/A answers are dropped). */
  score: number
}

export interface CategoryAssessment {
  category: Category
  /** True once every scored question in the category has an answer. */
  complete: boolean
  answered: number
  total: number
  /** Weighted mean of the answered questions, before flaws. */
  base: number
  flaws: Flaw[]
  /** Total deducted for flaws (already capped). */
  penalty: number
  /** Unrounded result. */
  exact: number
  /** Suggested score: clamped to 1–10 and rounded to the half point. */
  score: number
  lines: AnswerLine[]
  strongest?: AnswerLine
  weakest?: AnswerLine
}

/**
 * Turn one category's answers into a suggested score.
 *
 * 1. Each answer sits on an anchor (1.5 · 3.5 · 5 · 6.5 · 8 · 10) where
 *    5 is an average cookie.
 * 2. The category's base score is the weighted mean of those anchors.
 *    "Doesn't apply" answers drop out rather than pulling toward the middle.
 * 3. Flagged flaws subtract their penalty, capped at MAX_FLAW_PENALTY.
 * 4. The result is clamped to 1–10 and rounded to the half point.
 */
export function assessCategory(category: Category, answers: Answers): CategoryAssessment {
  const questions = QUESTIONS[category]
  const lines: AnswerLine[] = []
  let weightSum = 0
  let weighted = 0
  let answered = 0
  let total = 0
  const flaws: Flaw[] = []

  for (const q of questions) {
    const answer = answers[q.id]
    if (q.kind === 'flaws') {
      const picked = Array.isArray(answer) ? answer : []
      for (const flaw of q.flaws) if (picked.includes(flaw.id)) flaws.push(flaw)
      continue
    }
    if (q.kind === 'context') continue

    total += 1
    const option = typeof answer === 'string' ? q.options.find((o) => o.id === answer) : undefined
    if (!option) continue
    answered += 1
    if (option.score === null) continue
    weightSum += q.weight
    weighted += q.weight * option.score
    lines.push({ question: q, option, score: option.score })
  }

  const base = weightSum > 0 ? weighted / weightSum : STANDARD_SCORE
  const penalty = Math.min(
    MAX_FLAW_PENALTY,
    flaws.reduce((sum, f) => sum + f.penalty, 0),
  )
  const exact = clampScore(base - penalty)

  const ranked = [...lines].sort(
    (a, b) => b.score - a.score || b.question.weight - a.question.weight,
  )
  const strongest = ranked[0]
  const weakest = ranked.at(-1)

  return {
    category,
    complete: answered === total,
    answered,
    total,
    base,
    flaws,
    penalty,
    exact,
    score: roundToHalf(exact),
    lines,
    strongest: strongest && strongest.score > STANDARD_SCORE ? strongest : undefined,
    weakest:
      weakest && strongest && weakest.score < strongest.score && weakest !== strongest
        ? weakest
        : undefined,
  }
}

export function assessAll(answers: Answers): Record<Category, CategoryAssessment> {
  return {
    taste: assessCategory('taste', answers),
    texture: assessCategory('texture', answers),
    appearance: assessCategory('appearance', answers),
  }
}

/* ----------------------------- Quick review ----------------------------- */

/** The answer picked for a category's one quick question, if there is one. */
export function quickAnswer(category: Category, answers: Answers): Option | undefined {
  const question = QUICK_QUESTIONS[category]
  const answer = answers[question.id]
  return typeof answer === 'string'
    ? question.options.find((o) => o.id === answer && o.score !== null)
    : undefined
}

/**
 * Scores from a quick review: each answer taken at face value. A category
 * that hasn't been answered yet sits at average.
 */
export function quickScores(answers: Answers): Scores {
  const score = (category: Category) => quickAnswer(category, answers)?.score ?? STANDARD_SCORE
  return { taste: score('taste'), texture: score('texture'), appearance: score('appearance') }
}

/** True when all three quick questions have been answered. */
export function isQuickReview(answers: Answers): boolean {
  return CATEGORIES.every((category) => quickAnswer(category, answers) !== undefined)
}

/**
 * The answers that belong to one way of rating. A saved cookie keeps only
 * the set it was scored with, so how it was rated can be read back from it.
 */
export function answersFor(answers: Answers, style: 'quick' | 'full'): Answers {
  return Object.fromEntries(
    Object.entries(answers).filter(([id]) => isQuickAnswer(id) === (style === 'quick')),
  )
}

/* ------------------------------- Overall -------------------------------- */

export type Weights = Record<Category, number>

export const WEIGHT_PRESETS = {
  eating: {
    label: 'Taste and texture first',
    detail: '40% taste, 40% texture, 20% appearance.',
    weights: { taste: 2, texture: 2, appearance: 1 },
  },
  equal: {
    label: 'Equal thirds',
    detail: 'A third each for taste, texture and appearance.',
    weights: { taste: 1, texture: 1, appearance: 1 },
  },
  fair: {
    label: 'Fair judge',
    detail: 'The baking-contest split: 40% taste, 30% texture, 30% appearance.',
    weights: { taste: 4, texture: 3, appearance: 3 },
  },
  taste: {
    label: 'Taste first',
    detail: '50% taste, 30% texture, 20% appearance.',
    weights: { taste: 5, texture: 3, appearance: 2 },
  },
} as const satisfies Record<string, { label: string; detail: string; weights: Weights }>

export type WeightPreset = keyof typeof WEIGHT_PRESETS
export type OverallPrecision = 'half' | 'tenth'

/** Unrounded weighted mean of the three category scores. */
export function overallExact(scores: Scores, weights: Weights): number {
  let sum = 0
  let weightSum = 0
  for (const c of CATEGORIES) {
    sum += scores[c] * weights[c]
    weightSum += weights[c]
  }
  return weightSum > 0 ? sum / weightSum : STANDARD_SCORE
}

export function overallScore(
  scores: Scores,
  weights: Weights,
  precision: OverallPrecision = 'half',
): number {
  const exact = clampScore(overallExact(scores, weights))
  return precision === 'half' ? roundToHalf(exact) : roundToTenth(exact)
}

export function formatScore(n: number, precision: OverallPrecision = 'half'): string {
  if (precision === 'tenth') return n.toFixed(1)
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

/** Every half-point step from 1 to 10, for pickers and histograms. */
export const SCORE_STEPS: number[] = Array.from({ length: 19 }, (_, i) => 1 + i * 0.5)
