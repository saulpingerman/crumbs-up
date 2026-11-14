import { Check, ListChecks, LoaderCircle, Minus, Plus } from 'lucide-react'
import { useId } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/Button'
import { Medallion, ScoreBar } from '@/components/Score'
import { categoryText } from '@/components/category-styles'
import { cn } from '@/lib/cn'
import type { DraftRecord } from '@/lib/db/schema'
import { formatPlace } from '@/lib/format'
import {
  CATEGORIES,
  CATEGORY_META,
  MAX_SCORE,
  MIN_SCORE,
  WEIGHT_PRESETS,
  formatScore,
  overallScore,
  tierFor,
  type Category,
  type Scores,
} from '@/lib/rubric'
import { useSettings, weightsFor } from '@/lib/settings'
import { useCountUp } from '@/lib/use-count-up'
import { draftScores } from './useDraft'

interface Props {
  draft: DraftRecord
  editing: boolean
  saving: boolean
  onNotes: (notes: string) => void
  onManual: (scores: Scores | null) => void
  /** Jump back to a category's result screen to adjust it. */
  onAdjust: (category: Category) => void
  onGuided: () => void
  onSave: () => void
}

export function SummaryStep({
  draft,
  editing,
  saving,
  onNotes,
  onManual,
  onAdjust,
  onGuided,
  onSave,
}: Props) {
  const id = useId()
  const settings = useSettings()
  const { scores } = draftScores(draft)
  const overall = overallScore(scores, weightsFor(settings), settings.overallPrecision)
  const tier = tierFor(overall)
  const shown = useCountUp(overall, 1100, 1)
  const step = settings.overallPrecision === 'half' ? 2 : 10
  const display = Math.round(shown * step) / step

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-col items-center text-center">
        <p className="text-xs font-bold tracking-[0.14em] text-crust uppercase">
          {draft.manual ? 'Your scores' : 'The verdict'}
        </p>
        <h1 className="mt-1 font-display text-[28px] leading-tight font-semibold">
          {draft.details.cookieType}
        </h1>
        <p className="text-sm text-ink-soft">
          {draft.details.bakery} · {formatPlace(draft.details)}
        </p>
        <Medallion
          value={formatScore(display, settings.overallPrecision)}
          size="xl"
          label={`Overall score ${formatScore(overall, settings.overallPrecision)} out of 10`}
          className="mt-5 animate-pop"
        />
        <p className="mt-4 font-display text-3xl leading-none font-semibold">{tier.name}</p>
        <p className="mt-1.5 text-[15px] text-ink-soft">{tier.line}</p>
      </div>

      <section className="mt-6 space-y-4 rounded-3xl border border-line bg-paper p-5 shadow-card">
        {CATEGORIES.map((category) =>
          draft.manual ? (
            <ManualRow
              key={category}
              category={category}
              value={draft.manual[category]}
              onChange={(value) => onManual({ ...draft.manual!, [category]: value })}
            />
          ) : (
            <button
              key={category}
              type="button"
              onClick={() => onAdjust(category)}
              aria-label={`${CATEGORY_META[category].label} ${formatScore(scores[category])} — adjust`}
              className="block w-full rounded-xl text-left transition active:scale-[0.99]"
            >
              <ScoreBar category={category} score={scores[category]} />
            </button>
          ),
        )}
        <p className="border-t border-line/70 pt-3 text-xs leading-relaxed text-ink-faint">
          Overall is {WEIGHT_PRESETS[settings.weightPreset].label.toLowerCase()}:{' '}
          {WEIGHT_PRESETS[settings.weightPreset].detail.replace(/\.$/, '').toLowerCase()}.{' '}
          {!draft.manual && 'Tap a score to revisit it. '}
          <Link to="/settings" className="font-semibold underline">
            Change the weighting
          </Link>
        </p>
      </section>

      {draft.manual && (
        <button
          type="button"
          onClick={onGuided}
          className="mx-auto mt-4 flex items-center gap-1.5 text-sm font-semibold text-ink-soft underline-offset-4 hover:text-ink hover:underline"
        >
          <ListChecks className="size-4" />
          Let the questions score it instead
        </button>
      )}

      <div className="mt-6">
        <label
          htmlFor={`${id}-notes`}
          className="mb-1.5 flex items-baseline justify-between text-sm font-semibold"
        >
          Tasting notes
          <span className="text-xs font-medium text-ink-faint">Optional</span>
        </label>
        <textarea
          id={`${id}-notes`}
          value={draft.notes}
          onChange={(e) => onNotes(e.target.value)}
          rows={3}
          maxLength={4000}
          placeholder="Brown butter, flaky salt, still warm at 10am…"
          className="w-full resize-y rounded-2xl border border-line bg-paper px-3.5 py-3 leading-relaxed placeholder:text-ink-faint focus:border-crust focus:ring-2 focus:ring-crust/25 focus:outline-none"
        />
      </div>

      <div className="mt-auto pt-8">
        <Button size="lg" className="w-full" onClick={onSave} disabled={saving}>
          {saving ? (
            <LoaderCircle className="size-5 animate-spin" />
          ) : (
            <Check className="size-5" strokeWidth={2.6} />
          )}
          {editing ? 'Save changes' : 'Save to journal'}
        </Button>
      </div>
    </div>
  )
}

function ManualRow({
  category,
  value,
  onChange,
}: {
  category: Category
  value: number
  onChange: (value: number) => void
}) {
  const meta = CATEGORY_META[category]
  const set = (next: number) => onChange(Math.min(MAX_SCORE, Math.max(MIN_SCORE, next)))
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold">{meta.label}</span>
        <div className="flex items-center gap-2">
          <StepButton
            label={`Lower ${meta.label}`}
            disabled={value <= MIN_SCORE}
            onClick={() => set(value - 0.5)}
          >
            <Minus className="size-4" />
          </StepButton>
          <output
            aria-label={`${meta.label} score`}
            className={cn(
              'numerals w-12 text-center text-2xl font-semibold',
              categoryText[category],
            )}
          >
            {formatScore(value)}
          </output>
          <StepButton
            label={`Raise ${meta.label}`}
            disabled={value >= MAX_SCORE}
            onClick={() => set(value + 0.5)}
          >
            <Plus className="size-4" />
          </StepButton>
        </div>
      </div>
      <ScoreBar category={category} score={value} bare />
    </div>
  )
}

function StepButton({
  label,
  children,
  ...props
}: {
  label: string
  children: React.ReactNode
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex size-10 items-center justify-center rounded-full bg-oat text-ink transition active:scale-90 disabled:opacity-35"
      {...props}
    >
      {children}
    </button>
  )
}
