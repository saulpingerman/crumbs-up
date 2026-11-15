import type { CookieDetails, DraftRecord } from '@/lib/db/schema'
import {
  QUICK_QUESTION_LIST,
  QUICK_QUESTIONS,
  type Answers,
  type Category,
  type Question,
} from '@/lib/rubric'
import { todayIso } from '@/lib/format'
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
  | { kind: 'summary' }

/** Rating a cookie: a number for each category, then the verdict. */
const QUICK_STEPS: Step[] = [
  { kind: 'details' },
  ...QUICK_QUESTION_LIST.map((question, i): Step => ({
    kind: 'question',
    category: question.category,
    question,
    index: i + 1,
    count: QUICK_QUESTION_LIST.length,
  })),
  { kind: 'summary' },
]

const MANUAL_STEPS: Step[] = [{ kind: 'details' }, { kind: 'summary' }]

export function stepsFor(draft: Pick<DraftRecord, 'manual'>): Step[] {
  return draft.manual ? MANUAL_STEPS : QUICK_STEPS
}

const EARLIEST_DATE = '1950-01-01'
/** No cookie costs this much; a figure this size is a typing slip. */
const PRICE_LIMIT = 1000

/**
 * Tidy what was typed into the price box: digits and one decimal point,
 * with a comma read as the decimal point ("3,50" is three-fifty, not 350).
 */
export function cleanPrice(typed: string): string {
  const [whole = '', ...rest] = typed
    .replace(/,/g, '.')
    .replace(/[^\d.]/g, '')
    .split('.')
  return rest.length > 0 ? `${whole}.${rest.join('').slice(0, 2)}` : whole
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
  // ISO dates sort as text. Tomorrow's cookie hasn't been eaten yet, and a
  // year like 0206 is a slip of the keyboard.
  else if (details.eatenOn > todayIso() || details.eatenOn < EARLIEST_DATE) {
    errors.eatenOn = 'Pick a date up to today.'
  }
  if (details.price !== null && !(details.price >= 0 && details.price < PRICE_LIMIT)) {
    errors.price = 'Enter a price like 4.50.'
  }
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

/** 1 once a category has its number, for the progress bar. */
export function categoryProgress(category: Category, answers: Answers): number {
  return isAnswered(QUICK_QUESTIONS[category], answers) ? 1 : 0
}
