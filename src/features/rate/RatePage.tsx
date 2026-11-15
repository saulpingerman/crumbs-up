import { ArrowLeft, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { errorDetail } from '@/lib/error-detail'
import { NotFound } from '@/app/Errors'
import { IconButton } from '@/components/Button'
import { categoryBg, categoryText } from '@/components/category-styles'
import { Confirm } from '@/components/Sheet'
import { cn } from '@/lib/cn'
import { pendingCutout } from '@/lib/cutout/pending'
import { saveCookie, type SaveCookieInput } from '@/lib/db/cookies'
import type { CookieDetails, CookieRecord, ProcessedPhoto } from '@/lib/db/schema'
import { db, requestPersistentStorage } from '@/lib/db/db'
import { CATEGORY_META, TASTING_ORDER, answersFor, type Scores } from '@/lib/rubric'
import { getSettings, updateSettings } from '@/lib/settings'
import { isKnownStateCode } from '@/lib/states'
import { forgetPhoto, photoArrived } from '@/lib/use-photo'
import { useTitle } from '@/lib/use-title'
import { DetailsStep } from './DetailsStep'
import { ChoiceStep } from './QuestionStep'
import { categoryProgress, furthestStep, stepsFor, type Step } from './steps'
import { SummaryStep } from './SummaryStep'
import { draftScores, hasContent, useDraft } from './useDraft'

const ADVANCE_DELAY = 260

/**
 * A cookie was saved while its photo was still being cut out. Swap the
 * cut-out in when it arrives — unless the cookie has been edited or deleted
 * in the meantime, in which case whatever was done to it stands.
 */
async function finishCutout(
  saved: CookieRecord,
  input: SaveCookieInput,
  job: Promise<ProcessedPhoto | null>,
) {
  const photo = await job
  if (!photo) return
  const current = await db.cookies.get(saved.id)
  if (!current || current.updatedAt !== saved.updatedAt) return
  await saveCookie({ ...input, id: saved.id, photo })
  forgetPhoto(saved.id)
  photoArrived(saved.id)
}

export function RatePage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const editId = params.get('edit')
  // "Rate one" links from Discover and the map carry what they already know.
  const [prefill] = useState(() => {
    const seed: Partial<CookieDetails> = {}
    const type = params.get('type')
    const bakery = params.get('bakery')
    const city = params.get('city')
    const state = params.get('state')
    if (type) seed.cookieType = type.slice(0, 80)
    if (bakery) seed.bakery = bakery.slice(0, 120)
    if (city) seed.city = city.slice(0, 80)
    if (state && isKnownStateCode(state)) seed.state = state
    const lat = Number(params.get('lat'))
    const lng = Number(params.get('lng'))
    if (params.has('lat') && params.has('lng') && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      seed.place = { lat, lng }
    }
    return Object.keys(seed).length > 0 ? seed : undefined
  })
  const api = useDraft(editId, prefill)
  useTitle(editId ? 'Edit rating' : 'Rate a cookie')
  const { draft, status } = api

  const steps = stepsFor(draft)
  const furthest = furthestStep(steps, draft)
  const requested = params.get('step')
  const parsed = requested === null ? Number.NaN : Number.parseInt(requested, 10)
  // Editing opens on the verdict; a new rating opens on the details.
  const wanted = Number.isNaN(parsed) ? (editId ? steps.length - 1 : 0) : parsed
  const index = Math.min(Math.max(0, wanted), furthest)
  const step = steps[index]!

  // How many wizard steps sit on the history stack above the entry we came
  // in on. Each step is its own history entry, so the phone's back gesture
  // walks back through the questions like it would in a native app.
  const location = useLocation()
  const wizardState = location.state as { depth?: number; fromVerdict?: boolean } | null
  const depth = wizardState?.depth ?? 0
  /** This result screen was opened from the verdict to adjust one score. */
  const fromVerdict = wizardState?.fromVerdict === true

  const [shown, setShown] = useState(index)
  const [direction, setDirection] = useState(1)
  if (shown !== index) {
    setShown(index)
    setDirection(index > shown ? 1 : -1)
  }

  const [saving, setSaving] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  /** Where to land once the wizard's own history entries have been unwound. */
  const [exitTo, setExitTo] = useState<string | null>(null)
  const advance = useRef<ReturnType<typeof setTimeout>>(undefined)
  /** Scores typed in by hand, kept in case the user comes back to them. */
  const typedScores = useRef<Scores | null>(null)

  const searchFor = useCallback(
    (next: number) => {
      const search = new URLSearchParams()
      if (editId) search.set('edit', editId)
      search.set('step', String(next))
      return `?${search}`
    },
    [editId],
  )

  const go = useCallback(
    (next: number, mode: 'push' | 'replace' = 'push') => {
      clearTimeout(advance.current)
      void navigate(
        { search: searchFor(next) },
        mode === 'push' ? { state: { depth: depth + 1 } } : { replace: true, state: { depth } },
      )
    },
    [navigate, searchFor, depth],
  )

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [index])

  // A pending auto-advance belongs to the screen it was started on. If the
  // location changes first (Back, Close, the phone's back gesture), drop it,
  // or it would push a step with a stale idea of where it is in history.
  useEffect(() => () => clearTimeout(advance.current), [location.key])

  const back = () => {
    clearTimeout(advance.current)
    if (depth > 0) void navigate(-1)
    else go(index - 1, 'replace')
  }

  /** Leave the wizard for wherever it was opened from. */
  const leave = useCallback(() => {
    clearTimeout(advance.current)
    const historyIndex = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (historyIndex > depth) void navigate(-(depth + 1))
    else void navigate(editId ? `/cookie/${editId}` : '/', { replace: true })
  }, [navigate, editId, depth])

  function close() {
    if (editId) {
      if (api.touched) setConfirmDiscard(true)
      else void api.finish().then(leave)
      return
    }
    if (hasContent(draft)) toast('Saved as a draft', { description: 'Tap + to pick it back up.' })
    leave()
  }

  async function save() {
    setSaving(true)
    try {
      const { suggested, scores } = draftScores(draft)
      // A quick review can be saved before the photo's cut-out has arrived.
      const cutout = typeof draft.photo === 'object' ? pendingCutout(draft.photo) : undefined
      const input: SaveCookieInput = {
        id: editId ?? undefined,
        details: draft.details,
        notes: draft.notes,
        // A cookie keeps the answers of the one way it was rated, which is how
        // its page and a later edit tell a quick review from a full tasting.
        // A hand-scored cookie keeps any full-tasting answers too, so going
        // back to the questions later picks up where they were left.
        answers: answersFor(draft.answers, draft.manual ? 'full' : 'quick'),
        suggested,
        scores,
        photo: draft.photo,
      }
      const cookie = await saveCookie(input)
      if (cutout) void finishCutout(cookie, input, cutout)
      await api.finish()
      forgetPhoto(cookie.id)
      updateSettings({
        lastState: draft.details.state,
        changesSinceBackup: getSettings().changesSinceBackup + 1,
      })
      void requestPersistentStorage()
      if (editId) {
        toast.success('Changes saved')
        leave()
      } else {
        setExitTo(`/cookie/${cookie.id}`)
        if (depth > 0) void navigate(-depth)
      }
    } catch (error) {
      console.error(error)
      toast.error('Couldn’t save this cookie', {
        description: (
          <>
            Your answers are still here. Try again.
            <span className="mt-1 block font-mono text-[11px] opacity-70">
              {errorDetail(error)}
            </span>
          </>
        ),
        duration: 15_000,
      })
      setSaving(false)
    }
  }

  if (status === 'missing') return <NotFound />
  if (exitTo) {
    // A new cookie was saved. Once the wizard's own history entries have been
    // unwound, swap its first entry for the cookie's page, so "back" from
    // there returns to the journal rather than into a finished questionnaire.
    return depth === 0 ? (
      <Navigate to={exitTo} replace state={{ fresh: true }} />
    ) : (
      <div className="min-h-dvh" aria-busy />
    )
  }
  if (status === 'loading') return <div className="min-h-dvh" aria-busy />
  // Reached by going Forward into a wizard that has already been saved: the
  // entry remembers a depth that no longer means anything. Start it at zero.
  if (!editId && depth > 0 && index === 0 && !hasContent(draft)) {
    return <Navigate to={{ search: searchFor(0) }} replace state={{ depth: 0 }} />
  }
  // Keep the URL honest if it asked for a step that isn't reachable yet.
  if (requested !== String(index)) {
    return <Navigate to={{ search: searchFor(index) }} replace state={{ depth }} />
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col">
      <header className="pt-safe sticky top-0 z-20 bg-cream/92 backdrop-blur-lg">
        <div className="flex h-14 items-center gap-1 px-2">
          <IconButton
            label="Back"
            onClick={back}
            className={cn(index === 0 && 'invisible')}
            disabled={index === 0 || saving}
          >
            <ArrowLeft className="size-5" />
          </IconButton>
          <Progress step={step} manual={Boolean(draft.manual)} answers={draft.answers} />
          <IconButton label="Close" onClick={close} disabled={saving}>
            <X className="size-5" />
          </IconButton>
        </div>
      </header>

      {/* Re-keyed per step so each one slides in from the side it came from. */}
      <main
        key={index}
        className={cn(
          'flex flex-1 flex-col px-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))]',
          direction > 0 ? 'animate-step-forward' : 'animate-step-back',
        )}
      >
        <StepView
          step={step}
          api={api}
          editId={editId}
          saving={saving}
          onNext={() => go(index + 1)}
          onAutoNext={() => {
            clearTimeout(advance.current)
            advance.current = setTimeout(() => go(index + 1), ADVANCE_DELAY)
          }}
          onResume={() => go(furthest)}
          onDetails={() =>
            void navigate(
              { search: searchFor(0) },
              { state: { depth: depth + 1, fromVerdict: true } },
            )
          }
          // The details can hand straight back to the verdict when they were
          // opened from it, or when an old cookie is being corrected — as
          // long as every question still has its answer.
          toVerdict={(fromVerdict || editId !== null) && furthest === steps.length - 1}
          onManual={() => {
            api.setManual(typedScores.current ?? draftScores(draft).scores)
            go(1)
          }}
          onGuided={() => {
            typedScores.current = draft.manual
            api.setManual(null)
            // Replace, so "back" doesn't land on a quick-entry screen that no
            // longer exists.
            go(1, 'replace')
          }}
          onSave={() => void save()}
        />
      </main>

      <Confirm
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard your changes?"
        description="The cookie will stay exactly as it was before you started editing."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        destructive
        onConfirm={() => void api.finish().then(leave)}
      />
    </div>
  )
}

interface StepViewProps {
  step: Step
  api: ReturnType<typeof useDraft>
  editId: string | null
  saving: boolean
  onNext: () => void
  onAutoNext: () => void
  onResume: () => void
  onDetails: () => void
  toVerdict: boolean
  onManual: () => void
  onGuided: () => void
  onSave: () => void
}

function StepView({
  step,
  api,
  editId,
  saving,
  onNext,
  onAutoNext,
  onResume,
  onDetails,
  toVerdict,
  onManual,
  onGuided,
  onSave,
}: StepViewProps) {
  const { draft } = api

  switch (step.kind) {
    case 'details':
      return (
        <DetailsStep
          key={api.generation}
          api={api}
          editId={editId}
          onContinue={toVerdict ? onResume : onNext}
          onQuestions={toVerdict ? onNext : undefined}
          onManual={onManual}
          onResume={onResume}
        />
      )

    case 'question': {
      const { question } = step
      const value = draft.answers[question.id]
      if (question.kind !== 'scale') return null
      return (
        <ChoiceStep
          question={question}
          index={step.index}
          count={step.count}
          value={typeof value === 'string' ? value : undefined}
          onChoose={(optionId) => {
            api.setAnswer(question.id, optionId)
            onAutoNext()
          }}
          onNext={onNext}
        />
      )
    }

    case 'summary':
      return (
        <SummaryStep
          draft={draft}
          editId={editId}
          saving={saving}
          onNotes={api.setNotes}
          onManual={api.setManual}
          onNudge={api.setNudge}
          onDetails={onDetails}
          onGuided={onGuided}
          onSave={onSave}
        />
      )
  }
}

function Progress({
  step,
  manual,
  answers,
}: {
  step: Step
  manual: boolean
  answers: Record<string, string | string[]>
}) {
  if (manual) {
    return <p className="flex-1 text-center text-sm font-semibold text-ink-soft">Your own scores</p>
  }
  const active = step.kind === 'question' ? step.category : null
  return (
    <ol aria-label="Progress" className="flex flex-1 items-start gap-1.5 px-1 pt-1">
      {TASTING_ORDER.map((category) => {
        const done = step.kind === 'summary' ? 1 : categoryProgress(category, answers)
        return (
          <li
            key={category}
            className="flex-1"
            aria-current={active === category ? 'step' : undefined}
          >
            <div className="h-1.5 overflow-hidden rounded-full bg-oat">
              <div
                className={cn(
                  'h-full rounded-full transition-[width] duration-500 ease-out-soft',
                  categoryBg[category],
                )}
                style={{ width: `${done * 100}%` }}
              />
            </div>
            <p
              className={cn(
                'mt-1 text-center text-[10px] font-bold tracking-[0.12em] uppercase transition-colors',
                active === category ? categoryText[category] : 'text-ink-faint',
              )}
            >
              {CATEGORY_META[category].verb}
            </p>
          </li>
        )
      })}
    </ol>
  )
}
