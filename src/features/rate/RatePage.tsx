import { ArrowLeft, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { NotFound } from '@/app/Errors'
import { IconButton } from '@/components/Button'
import { categoryBg, categoryText } from '@/components/category-styles'
import { Confirm } from '@/components/Sheet'
import { cn } from '@/lib/cn'
import { saveCookie } from '@/lib/db/cookies'
import { requestPersistentStorage } from '@/lib/db/db'
import {
  CATEGORY_META,
  TASTING_ORDER,
  TEXTURE_STYLE_QUESTION_ID,
  getQuestion,
  type Category,
} from '@/lib/rubric'
import { getSettings, updateSettings } from '@/lib/settings'
import { forgetPhoto } from '@/lib/use-photo'
import { useTitle } from '@/lib/use-title'
import { DetailsStep } from './DetailsStep'
import { ChoiceStep, FlawStep } from './QuestionStep'
import { ResultStep } from './ResultStep'
import { categoryProgress, furthestStep, stepsFor, type Step } from './steps'
import { SummaryStep } from './SummaryStep'
import { draftScores, hasContent, useDraft } from './useDraft'

const ADVANCE_DELAY = 260

export function RatePage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const editId = params.get('edit')
  const api = useDraft(editId)
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
  const depth = (location.state as { depth?: number } | null)?.depth ?? 0

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

  useEffect(() => () => clearTimeout(advance.current), [])

  const back = () => {
    if (depth > 0) void navigate(-1)
    else go(index - 1, 'replace')
  }

  /** Leave the wizard for wherever it was opened from. */
  const leave = useCallback(() => {
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
      const cookie = await saveCookie({
        id: editId ?? undefined,
        details: draft.details,
        notes: draft.notes,
        answers: draft.manual ? {} : draft.answers,
        suggested,
        scores,
        photo: draft.photo,
      })
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
        description: 'Your answers are still here — try again.',
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
  // Keep the URL honest if it asked for a step that isn't reachable yet.
  if (requested !== String(index)) {
    return <Navigate to={{ search: searchFor(index) }} replace state={{ depth }} />
  }

  const resultIndex = (category: Category) =>
    steps.findIndex((s) => s.kind === 'result' && s.category === category)

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col">
      <header className="pt-safe sticky top-0 z-20 bg-cream/92 backdrop-blur-lg">
        <div className="flex h-14 items-center gap-1 px-2">
          <IconButton
            label="Back"
            onClick={back}
            className={cn(index === 0 && 'invisible')}
            disabled={index === 0}
          >
            <ArrowLeft className="size-5" />
          </IconButton>
          <Progress step={step} manual={Boolean(draft.manual)} answers={draft.answers} />
          <IconButton label="Close" onClick={close}>
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
          isLastCategory={(category) => TASTING_ORDER.at(-1) === category}
          onNext={() => go(index + 1)}
          onAutoNext={() => {
            clearTimeout(advance.current)
            advance.current = setTimeout(() => go(index + 1), ADVANCE_DELAY)
          }}
          onResume={() => go(furthest)}
          onAdjust={(category) => go(resultIndex(category))}
          onManual={() => {
            api.setManual(draftScores(draft).scores)
            go(1)
          }}
          onGuided={() => {
            api.setManual(null)
            go(1)
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
  isLastCategory: (category: Category) => boolean
  onNext: () => void
  onAutoNext: () => void
  onResume: () => void
  onAdjust: (category: Category) => void
  onManual: () => void
  onGuided: () => void
  onSave: () => void
}

function StepView({
  step,
  api,
  editId,
  saving,
  isLastCategory,
  onNext,
  onAutoNext,
  onResume,
  onAdjust,
  onManual,
  onGuided,
  onSave,
}: StepViewProps) {
  const { draft } = api

  switch (step.kind) {
    case 'details':
      return (
        <DetailsStep
          api={api}
          editId={editId}
          onContinue={onNext}
          onManual={onManual}
          onResume={onResume}
        />
      )

    case 'question': {
      const { question } = step
      if (question.kind === 'flaws') {
        const value = draft.answers[question.id]
        return (
          <FlawStep
            question={question}
            index={step.index}
            count={step.count}
            value={Array.isArray(value) ? value : []}
            onChange={(ids) => api.setAnswer(question.id, ids)}
            onContinue={onNext}
          />
        )
      }
      const value = draft.answers[question.id]
      return (
        <ChoiceStep
          question={question}
          index={step.index}
          count={step.count}
          value={typeof value === 'string' ? value : undefined}
          styleName={question.id === 'bite.type' ? textureStyleName(draft.answers) : undefined}
          onChoose={(optionId) => {
            api.setAnswer(question.id, optionId)
            onAutoNext()
          }}
        />
      )
    }

    case 'result': {
      const next = TASTING_ORDER[TASTING_ORDER.indexOf(step.category) + 1]
      return (
        <ResultStep
          category={step.category}
          answers={draft.answers}
          nudge={draft.nudges[step.category]}
          onNudge={(value) => api.setNudge(step.category, value)}
          nextLabel={
            isLastCategory(step.category) || !next
              ? 'See the verdict'
              : `Next: ${CATEGORY_META[next].label.toLowerCase()}`
          }
          onContinue={onNext}
        />
      )
    }

    case 'summary':
      return (
        <SummaryStep
          draft={draft}
          editing={Boolean(editId)}
          saving={saving}
          onNotes={api.setNotes}
          onManual={api.setManual}
          onAdjust={onAdjust}
          onGuided={onGuided}
          onSave={onSave}
        />
      )
  }
}

/** "“chewy”" — the picked texture style, quoted for use in a prompt. */
function textureStyleName(answers: Record<string, string | string[]>): string | undefined {
  const question = getQuestion(TEXTURE_STYLE_QUESTION_ID)
  const picked = answers[TEXTURE_STYLE_QUESTION_ID]
  if (!question || question.kind !== 'context' || typeof picked !== 'string') return undefined
  const option = question.options.find((o) => o.id === picked)
  return option ? `“${option.label.toLowerCase()}”` : undefined
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
    return <p className="flex-1 text-center text-sm font-semibold text-ink-soft">Quick entry</p>
  }
  const active = step.kind === 'question' || step.kind === 'result' ? step.category : null
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
