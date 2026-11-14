import type { CookieDetails, DraftRecord } from '@/lib/db/schema'
import { QUESTIONS, TASTING_ORDER, type Answers, type Category, type Question } from '@/lib/rubric'
import { isKnownStateCode } from '@/lib/states'

export type Step =
  | { kind: 'details' }
  | {
      kind: 'question'
      category: Category
      question: Question
      /** 1-based position within the category. */
      index: number
      count: number
    }
  | { kind: 'result'; category: Category }
  | { kind: 'summary' }

const GUIDED_STEPS: Step[] = [
  { kind: 'details' },
  ...TASTING_ORDER.flatMap((category): Step[] => {
    const questions = QUESTIONS[category]
    return [
      ...questions.map((question, i): Step => ({
        kind: 'question',
        category,
        question,
        index: i + 1,
        count: questions.length,
      })),
      { kind: 'result', category },
    ]
  }),
  { kind: 'summary' },
]

const MANUAL_STEPS: Step[] = [{ kind: 'details' }, { kind: 'summary' }]

export function stepsFor(draft: Pick<DraftRecord, 'manual'>): Step[] {
  return draft.manual ? MANUAL_STEPS : GUIDED_STEPS
}

export interface DetailErrors {
  cookieType?: string
  bakery?: string
  state?: string
  eatenOn?: string
  price?: string
}

export function validateDetails(details: CookieDetails): DetailErrors {
  const errors: DetailErrors = {}
  if (!details.cookieType.trim()) errors.cookieType = 'What kind of cookie is it?'
  if (!details.bakery.trim()) errors.bakery = 'Where did you get it?'
  if (!isKnownStateCode(details.state)) errors.state = 'Pick a state.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(details.eatenOn)) errors.eatenOn = 'Pick a date.'
  if (details.price !== null && !(details.price >= 0)) errors.price = 'Enter a price like 4.50.'
  return errors
}

export function isAnswered(question: Question, answers: Answers): boolean {
  if (question.kind === 'flaws') return true
  const answer = answers[question.id]
  return typeof answer === 'string' && question.options.some((o) => o.id === answer)
}

function isPassed(step: Step, draft: DraftRecord): boolean {
  switch (step.kind) {
    case 'details':
      return Object.keys(validateDetails(draft.details)).length === 0
    case 'question':
      return isAnswered(step.question, draft.answers)
    default:
      return true
  }
}

/** The furthest step that may be shown: the first one not yet completed. */
export function furthestStep(steps: Step[], draft: DraftRecord): number {
  const blocked = steps.findIndex((step) => !isPassed(step, draft))
  return blocked === -1 ? steps.length - 1 : blocked
}

/** Answered / total scored questions in a category, for the progress bar. */
export function categoryProgress(category: Category, answers: Answers): number {
  const questions = QUESTIONS[category].filter((q) => q.kind !== 'flaws')
  const done = questions.filter((q) => isAnswered(q, answers)).length
  return questions.length ? done / questions.length : 0
}
