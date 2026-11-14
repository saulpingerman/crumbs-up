import { useCallback, useEffect, useRef, useState } from 'react'
import { clearDraft, draftKey, loadDraft, saveDraft } from '@/lib/db/cookies'
import { db } from '@/lib/db/db'
import type { CookieDetails, CookieRecord, DraftRecord, ProcessedPhoto } from '@/lib/db/schema'
import { todayIso } from '@/lib/format'
import { CATEGORIES, assessAll, type Category, type Scores } from '@/lib/rubric'
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
    },
    notes: '',
    answers: {},
    nudges: { taste: 0, texture: 0, appearance: 0 },
    manual: null,
    photo: 'none',
  }
}

export function draftFromCookie(cookie: CookieRecord): DraftRecord {
  const assessed = assessAll(cookie.answers)
  const guided = CATEGORIES.every((c) => assessed[c].complete)
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
    },
    notes: cookie.notes,
    answers: cookie.answers,
    nudges: guided
      ? {
          taste: cookie.scores.taste - assessed.taste.score,
          texture: cookie.scores.texture - assessed.texture.score,
          appearance: cookie.scores.appearance - assessed.appearance.score,
        }
      : { taste: 0, texture: 0, appearance: 0 },
    manual: guided ? null : { ...cookie.scores },
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
  setDetails: (patch: Partial<CookieDetails>) => void
  setAnswer: (questionId: string, value: string | string[]) => void
  setNudge: (category: Category, value: number) => void
  setNotes: (notes: string) => void
  setPhoto: (photo: ProcessedPhoto | 'none') => void
  setManual: (manual: Scores | null) => void
  startOver: () => void
  /** Stop autosaving and delete the stored draft (after a successful save). */
  finish: () => Promise<void>
}

/**
 * The in-progress rating. It is mirrored to IndexedDB after every change,
 * so closing the app mid-cookie loses nothing.
 */
export function useDraft(editId: string | null): DraftApi {
  const key = draftKey(editId)
  const [loaded, setLoaded] = useState<{ key: string; status: Status } | null>(null)
  const status: Status = loaded?.key === key ? loaded.status : 'loading'
  const [draft, setDraft] = useState<DraftRecord>(() => blankDraft(key))
  const [resumed, setResumed] = useState(false)
  const [touched, setTouched] = useState(false)
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
      if (stored && hasContent(stored)) {
        setDraft({ ...blankDraft(key), ...stored })
        setResumed(!editId)
      } else {
        setDraft(cookie ? draftFromCookie(cookie) : blankDraft(key))
        setResumed(false)
      }
      setTouched(false)
      setLoaded({ key, status: 'ready' })
    })()
    return () => {
      cancelled = true
    }
  }, [key, editId])

  // Autosave, lightly debounced so rapid taps make one write.
  useEffect(() => {
    if (status !== 'ready' || !dirty.current || finished.current) return
    const timer = setTimeout(() => {
      if (!finished.current) void saveDraft(latest.current)
    }, 250)
    return () => clearTimeout(timer)
  }, [draft, status])

  // Flush a pending write if the wizard is closed inside the debounce window.
  useEffect(
    () => () => {
      if (dirty.current && !finished.current) void saveDraft(latest.current)
    },
    [],
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
    setDetails: useCallback(
      (patch) => update((d) => ({ ...d, details: { ...d.details, ...patch } })),
      [update],
    ),
    setAnswer: useCallback(
      (questionId, value) =>
        update((d) => ({ ...d, answers: { ...d.answers, [questionId]: value } })),
      [update],
    ),
    setNudge: useCallback(
      (category, value) => update((d) => ({ ...d, nudges: { ...d.nudges, [category]: value } })),
      [update],
    ),
    setNotes: useCallback((notes) => update((d) => ({ ...d, notes })), [update]),
    setPhoto: useCallback((photo) => update((d) => ({ ...d, photo })), [update]),
    setManual: useCallback((manual) => update((d) => ({ ...d, manual })), [update]),
    startOver: useCallback(() => {
      setResumed(false)
      setTouched(false)
      dirty.current = false
      setDraft(blankDraft(key))
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
  const assessed = assessAll(draft.answers)
  const suggested = {
    taste: assessed.taste.score,
    texture: assessed.texture.score,
    appearance: assessed.appearance.score,
  }
  const scores = { ...suggested }
  for (const c of CATEGORIES) {
    scores[c] = Math.min(10, Math.max(1, suggested[c] + draft.nudges[c]))
  }
  return { suggested, scores }
}
