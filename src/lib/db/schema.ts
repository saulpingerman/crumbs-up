import { z } from 'zod'

const score = z
  .number()
  .min(1)
  .max(10)
  .refine((n) => Number.isInteger(n * 2), 'Scores move in half points')

export const scoresSchema = z.object({
  taste: score,
  texture: score,
  appearance: score,
})

export const answersSchema = z.record(z.string(), z.union([z.string(), z.array(z.string())]))

export const cookieSchema = z.object({
  id: z.string().min(1),
  createdAt: z.number(),
  updatedAt: z.number(),
  /** Calendar day the cookie was eaten, `YYYY-MM-DD`. */
  eatenOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cookieType: z.string().trim().min(1).max(80),
  bakery: z.string().trim().min(1).max(120),
  city: z.string().trim().max(80).default(''),
  /** USPS code, or `XX` for outside the U.S. */
  state: z.string().length(2),
  price: z.number().nonnegative().nullable().default(null),
  notes: z.string().max(4000).default(''),
  answers: answersSchema.default({}),
  /** What the questionnaire recommended. */
  suggested: scoresSchema,
  /** What was actually recorded (suggested, plus any manual nudge). */
  scores: scoresSchema,
  rubricVersion: z.number().int().nonnegative(),
  hasPhoto: z.boolean().default(false),
  /** Marks bundled demo cookies so they can be removed in one go. */
  sample: z.boolean().optional(),
})

export type CookieRecord = z.infer<typeof cookieSchema>

/** The fields a person types in, as opposed to the ones the app derives. */
export interface CookieDetails {
  eatenOn: string
  cookieType: string
  bakery: string
  city: string
  state: string
  price: number | null
}

export interface StoredImage {
  cookieId: string
  mime: string
  /**
   * Raw bytes rather than a Blob: Safari has a long history of Blob-in-
   * IndexedDB regressions, and ArrayBuffers have been dependable throughout.
   */
  data: ArrayBuffer
  width: number
  height: number
}

export interface ProcessedPhoto {
  mime: string
  full: ArrayBuffer
  thumb: ArrayBuffer
  width: number
  height: number
  thumbWidth: number
  thumbHeight: number
}

export interface DraftRecord {
  /** `new`, or `edit:<cookie id>`. */
  key: string
  updatedAt: number
  details: CookieDetails
  notes: string
  answers: Record<string, string | string[]>
  /** Manual half-point nudges applied on top of each suggested score. */
  nudges: { taste: number; texture: number; appearance: number }
  /**
   * Set when the questionnaire is skipped and scores are typed in directly
   * (handy for logging cookies rated before the app existed).
   */
  manual: { taste: number; texture: number; appearance: number } | null
  /**
   * `keep` = the cookie being edited keeps its saved photo,
   * `none` = no photo, otherwise the freshly picked photo.
   */
  photo: ProcessedPhoto | 'keep' | 'none'
}
