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
  const answer = answers[question.id]
  // "No flaws" is an answer too: it is recorded as an empty list.
  if (question.kind === 'flaws') return Array.isArray(answer)
  return typeof answer === 'string' && question.options.some((o) => o.id === answer)
}

/**
 * The furthest step that may be shown: the first one not yet completed.
 * A flaw check counts as done once it has an answer, or once anything after
 * it has been answered — so resuming a draft never skips one unseen.
 */
export function furthestStep(steps: Step[], draft: DraftRecord): number {
  let lastAnswered = -1
  steps.forEach((step, i) => {
    if (step.kind === 'question' && isAnswered(step.question, draft.answers)) lastAnswered = i
  })
  const blocked = steps.findIndex((step, i) => {
    switch (step.kind) {
      case 'details':
        return Object.keys(validateDetails(draft.details)).length > 0
      case 'question':
        return (
          !isAnswered(step.question, draft.answers) &&
          !(step.question.kind === 'flaws' && i < lastAnswered)
        )
      default:
        return false
    }
  })
  return blocked === -1 ? steps.length - 1 : blocked
}

/** Answered / total scored questions in a category, for the progress bar. */
export function categoryProgress(category: Category, answers: Answers): number {
  const questions = QUESTIONS[category]
  const done = questions.filter((q) => isAnswered(q, answers)).length
  return questions.length ? done / questions.length : 0
}
