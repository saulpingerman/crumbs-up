export const CATEGORIES = ['taste', 'texture', 'appearance'] as const
export type Category = (typeof CATEGORIES)[number]

/** The order the questionnaire walks through a cookie: look, bite, savor. */
export const TASTING_ORDER: readonly Category[] = ['appearance', 'texture', 'taste']

export type Scores = Record<Category, number>

export interface Option {
  id: string
  label: string
  /** One short line that makes the label concrete. */
  detail?: string
  /**
   * Where this answer sits on the 1–10 scale (5 = a standard Toll House
   * cookie). `null` means "doesn't apply" and removes the question from the
   * average instead of pulling it toward the middle.
   */
  score: number | null
}

export interface ScaleQuestion {
  kind: 'scale'
  id: string
  category: Category
  /** Short name used in breakdowns, e.g. "Flavor depth". */
  title: string
  prompt: string
  hint?: string
  weight: number
  options: Option[]
}

/** Unscored context question (e.g. which texture style the cookie aims for). */
export interface ContextQuestion {
  kind: 'context'
  id: string
  category: Category
  title: string
  prompt: string
  hint?: string
  options: Option[]
}

export interface Flaw {
  id: string
  label: string
  /** Points removed from the category score. */
  penalty: number
}

export interface FlawQuestion {
  kind: 'flaws'
  id: string
  category: Category
  title: string
  prompt: string
  hint?: string
  flaws: Flaw[]
}

export type Question = ScaleQuestion | ContextQuestion | FlawQuestion

/** question id -> chosen option id (scale/context) or flaw ids (flaws). */
export type Answers = Record<string, string | string[]>

export interface CategoryMeta {
  id: Category
  /** Noun used on scorecards. */
  label: string
  /** Verb used while tasting. */
  verb: string
  blurb: string
}
