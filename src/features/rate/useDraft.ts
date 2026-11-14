import { useCallback, useEffect, useRef, useState } from 'react'
import { clearDraft, draftKey, loadDraft, saveDraft } from '@/lib/db/cookies'
import { db } from '@/lib/db/db'
import type { CookieDetails, CookieRecord, DraftRecord, ProcessedPhoto } from '@/lib/db/schema'
import { todayIso } from '@/lib/format'
import {
  assessAll,
  CATEGORIES,
  getQuestion,
  isQuickReview,
  quickScores,
  type Answers,
  type Category,
  type Scores,
} from '@/lib/rubric'
import { getSettings } from '@/lib/settings'

export function blankDraft(key: string): DraftRecord {
  return {
    key,
    updatedAt: Date.now(),
    details: {
      eatenOn: todayIso(),
      cookieType: '',
      bakery: '',
      city: '',
      state: getSettings().lastState,
      price: null,
      place: null,
    },
    notes: '',
    answers: {},
    nudges: { taste: 0, texture: 0, appearance: 0 },
    manual: null,
    quick: getSettings().reviewStyle === 'quick',
    photo: 'none',
  }
}

/** What the answers alone come to, for whichever way of rating is in use. */
function suggestedScores(answers: Answers, quick: boolean): Scores {
  if (quick) return quickScores(answers)
  const assessed = assessAll(answers)
  return {
    taste: assessed.taste.score,
    texture: assessed.texture.score,
    appearance: assessed.appearance.score,
  }
}

export function draftFromCookie(cookie: CookieRecord): DraftRecord {
  const assessed = assessAll(cookie.answers)
  const full = CATEGORIES.every((c) => assessed[c].complete)
  const quick = !full && isQuickReview(cookie.answers)
  // Scored by answering questions, the full set or the quick three?
  const guided = full || quick
  const suggested = suggestedScores(cookie.answers, quick)
  return {
    key: draftKey(cookie.id),
    updatedAt: Date.now(),
    details: {
      eatenOn: cookie.eatenOn,
      cookieType: cookie.cookieType,
      bakery: cookie.bakery,
      city: cookie.city,
      state: cookie.state,
      price: cookie.price,
      place: cookie.place ?? null,
    },
    notes: cookie.notes,
    answers: cookie.answers,
    nudges: guided
      ? {
          taste: cookie.scores.taste - suggested.taste,
          texture: cookie.scores.texture - suggested.texture,
          appearance: cookie.scores.appearance - suggested.appearance,
        }
      : { taste: 0, texture: 0, appearance: 0 },
    manual: guided ? null : { ...cookie.scores },
    quick,
    photo: cookie.hasPhoto ? 'keep' : 'none',
  }
}

export function hasContent(draft: DraftRecord): boolean {
  return Boolean(
    draft.details.cookieType.trim() ||
    draft.details.bakery.trim() ||
    draft.notes.trim() ||
    Object.keys(draft.answers).length ||
    draft.manual ||
    (draft.photo !== 'none' && draft.photo !== 'keep'),
  )
}

type Status = 'loading' | 'ready' | 'missing'

export interface DraftApi {
  status: Status
  draft: DraftRecord
  /** True when an unfinished draft from an earlier visit was picked up. */
  resumed: boolean
  /** True once anything has been changed during this visit. */
  touched: boolean
  /** Changes whenever the draft is replaced wholesale (loaded or started over). */
  generation: number
  setDetails: (patch: Partial<CookieDetails>) => void
  setAnswer: (questionId: string, value: string | string[]) => void
  setNudge: (category: Category, value: number) => void
  setNotes: (notes: string) => void
  setPhoto: (photo: ProcessedPhoto | 'none') => void
  setManual: (manual: Scores | null) => void
  /** Switch between the quick three questions and the full tasting. */
  setQuick: (quick: boolean) => void
  startOver: () => void
  /** Stop autosaving and delete the stored draft (after a successful save). */
  finish: () => Promise<void>
}

/**
 * The in-progress rating. It is mirrored to IndexedDB after every change,
 * so closing the app mid-cookie loses nothing.
 */
/**
 * @param prefill Details to start a brand-new rating with (e.g. a cookie
 *   type picked from a recommendation). Ignored when resuming or editing.
 */
export function useDraft(editId: string | null, prefill?: Partial<CookieDetails>): DraftApi {
  const key = draftKey(editId)
  const [loaded, setLoaded] = useState<{ key: string; status: Status } | null>(null)
  const status: Status = loaded?.key === key ? loaded.status : 'loading'
  const [draft, setDraft] = useState<DraftRecord>(() => blankDraft(key))
  const [resumed, setResumed] = useState(false)
  const [touched, setTouched] = useState(false)
  const [generation, setGeneration] = useState(0)
  const finished = useRef(false)
  const dirty = useRef(false)
  const latest = useRef(draft)
  useEffect(() => {
    latest.current = draft
  }, [draft])

  useEffect(() => {
    let cancelled = false
    finished.current = false
    dirty.current = false
    void (async () => {
      const [stored, cookie] = await Promise.all([
        loadDraft(key),
        editId ? db.cookies.get(editId) : undefined,
      ])
      if (cancelled) return
      if (editId && !cookie) {
        setLoaded({ key, status: 'missing' })
        return
      }
      if (cookie) {
        // Edits are never restored from an earlier visit: quietly re-applying
        // half-forgotten changes to a saved cookie would be worse than
        // losing them. They live in memory until Save.
        setDraft(draftFromCookie(cookie))
        setResumed(false)
        if (stored) void clearDraft(key)
      } else if (stored && hasContent(stored)) {
        setDraft({ ...blankDraft(key), ...stored })
        setResumed(true)
      } else {
        const blank = blankDraft(key)
        setDraft(prefill ? { ...blank, details: { ...blank.details, ...prefill } } : blank)
        setResumed(false)
      }
      setTouched(false)
      setGeneration((g) => g + 1)
      setLoaded({ key, status: 'ready' })
    })()
    return () => {
      cancelled = true
    }
    // `prefill` only seeds a new draft; it is read once, on load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, editId])

  // Autosave new ratings, lightly debounced so rapid taps make one write.
  useEffect(() => {
    if (editId || status !== 'ready' || !dirty.current || finished.current) return
    const timer = setTimeout(() => {
      if (!finished.current) void saveDraft(latest.current)
    }, 250)
    return () => clearTimeout(timer)
  }, [draft, status, editId])

  // Flush a pending write if the wizard is closed inside the debounce window.
  const persist = !editId
  useEffect(
    () => () => {
      if (persist && dirty.current && !finished.current) void saveDraft(latest.current)
    },
    [persist],
  )

  const update = useCallback((fn: (d: DraftRecord) => DraftRecord) => {
    dirty.current = true
    setTouched(true)
    setDraft((d) => ({ ...fn(d), updatedAt: Date.now() }))
  }, [])

  return {
    status,
    draft,
    resumed,
    touched,
    generation,
    setDetails: useCallback(
      (patch) => update((d) => ({ ...d, details: { ...d.details, ...patch } })),
      [update],
    ),
    setAnswer: useCallback(
      (questionId, value) =>
        update((d) => {
          const answers = { ...d.answers, [questionId]: value }
          const category = getQuestion(questionId)?.category
          const changed = JSON.stringify(d.answers[questionId] ?? null) !== JSON.stringify(value)
          // A nudge was a judgement on the old suggestion. Once an answer
          // changes, the suggestion is new, so the nudge starts over.
          return category && changed && d.nudges[category] !== 0
            ? { ...d, answers, nudges: { ...d.nudges, [category]: 0 } }
            : { ...d, answers }
        }),
      [update],
    ),
    setNudge: useCallback(
      (category, value) => update((d) => ({ ...d, nudges: { ...d.nudges, [category]: value } })),
      [update],
    ),
    setNotes: useCallback((notes) => update((d) => ({ ...d, notes })), [update]),
    setPhoto: useCallback((photo) => update((d) => ({ ...d, photo })), [update]),
    setManual: useCallback((manual) => update((d) => ({ ...d, manual })), [update]),
    setQuick: useCallback(
      (quick) =>
        update((d) =>
          // A nudge adjusts one way's suggestion; it means nothing to the other's.
          d.quick === quick ? d : { ...d, quick, nudges: { taste: 0, texture: 0, appearance: 0 } },
        ),
      [update],
    ),
    startOver: useCallback(() => {
      setResumed(false)
      setTouched(false)
      dirty.current = false
      setDraft(blankDraft(key))
      setGeneration((g) => g + 1)
      void clearDraft(key)
    }, [key]),
    finish: useCallback(async () => {
      finished.current = true
      await clearDraft(key)
    }, [key]),
  }
}

/** Final scores for a draft: suggestion plus nudge, or the typed-in values. */
export function draftScores(draft: DraftRecord): { suggested: Scores; scores: Scores } {
  if (draft.manual) return { suggested: { ...draft.manual }, scores: { ...draft.manual } }
  const suggested = suggestedScores(draft.answers, draft.quick)
  const scores = { ...suggested }
  for (const c of CATEGORIES) {
    scores[c] = Math.min(10, Math.max(1, suggested[c] + draft.nudges[c]))
  }
  return { suggested, scores }
}
