import { ArrowRight, Minus, Plus, RotateCcw } from 'lucide-react'
import { Button } from '@/components/Button'
import { ScoreBar } from '@/components/Score'
import { categoryBg, categoryText } from '@/components/category-styles'
import { cn } from '@/lib/cn'
import {
  ANCHORS,
  CATEGORY_META,
  MAX_SCORE,
  MIN_SCORE,
  assessCategory,
  formatScore,
  tierFor,
  type Answers,
  type Category,
} from '@/lib/rubric'
import { useCountUp } from '@/lib/use-count-up'

interface Props {
  category: Category
  answers: Answers
  nudge: number
  onNudge: (value: number) => void
  nextLabel: string
  onContinue: () => void
}

/** The reveal for one category: the suggested score, why, and a nudge. */
export function ResultStep({ category, answers, nudge, onNudge, nextLabel, onContinue }: Props) {
  const meta = CATEGORY_META[category]
  const assessed = assessCategory(category, answers)
  const final = Math.min(MAX_SCORE, Math.max(MIN_SCORE, assessed.score + nudge))
  // What the nudge actually amounts to once the score is kept within 1–10.
  const moved = final - assessed.score
  const shown = useCountUp(final, 800, 1)
  const display = Math.round(shown * 2) / 2
  const tier = tierFor(final)

  return (
    <div className="flex flex-1 flex-col">
      <h1 className={cn('text-xs font-bold tracking-[0.14em] uppercase', categoryText[category])}>
        {meta.label} score
      </h1>

      <div className="mt-2 flex items-end gap-3">
        <span
          aria-live="polite"
          aria-label={`${meta.label}: ${formatScore(final)} out of 10`}
          className={cn(
            'numerals text-[104px] leading-[0.85] font-semibold',
            categoryText[category],
          )}
        >
          {formatScore(display)}
        </span>
        <span className="pb-2">
          <span className="block text-sm font-semibold text-ink-faint">out of 10</span>
          <span className="block font-display text-2xl leading-tight font-semibold">
            {tier.name}
          </span>
        </span>
      </div>

      <ScoreBar category={category} score={final} bare className="mt-5" />
      <div className="mt-1.5 flex justify-center text-[11px] font-semibold text-ink-faint">
        ▲ 5 = a standard Toll House cookie
      </div>

      <section className="mt-6 rounded-3xl border border-line bg-paper p-4 shadow-card">
        <h2 className="text-sm font-bold">How we got there</h2>
        <ul className="mt-2 divide-y divide-line/70">
          {assessed.lines.map((line) => (
            <li key={line.question.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-ink-soft">{line.question.title}</p>
                <p className="truncate text-[15px] font-semibold">{line.option.label}</p>
              </div>
              <Rungs score={line.score} category={category} />
            </li>
          ))}
          {assessed.flaws.map((flaw) => (
            <li key={flaw.id} className="flex items-center justify-between gap-3 py-2.5">
              <p className="text-[15px] font-semibold text-danger">{flaw.label}</p>
              <span className="numerals text-[15px] font-semibold text-danger">
                −{formatScore(flaw.penalty)}
              </span>
            </li>
          ))}
        </ul>
        {assessed.penalty > 0 &&
          assessed.penalty < assessed.flaws.reduce((s, f) => s + f.penalty, 0) && (
            <p className="mt-1 text-xs text-ink-faint">
              Flaws take off {formatScore(assessed.penalty)} points at most.
            </p>
          )}
      </section>

      <section className="mt-3 flex items-center gap-3 rounded-3xl bg-oat p-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold">Your call</h2>
          <p className="text-[13px] leading-snug text-ink-soft">
            {moved === 0
              ? 'Gut says different? Nudge it by half points.'
              : `Suggested ${formatScore(assessed.score)} · you moved it ${moved > 0 ? '+' : '−'}${formatScore(Math.abs(moved))}.`}
          </p>
          {moved !== 0 && (
            <button
              type="button"
              onClick={() => onNudge(0)}
              className="mt-1 inline-flex items-center gap-1 text-[13px] font-bold underline underline-offset-2"
            >
              <RotateCcw className="size-3.5" /> Back to suggested
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <NudgeButton
            label={`Lower ${meta.label.toLowerCase()} by half a point`}
            disabled={final <= MIN_SCORE}
            onClick={() => onNudge(final - 0.5 - assessed.score)}
          >
            <Minus className="size-5" />
          </NudgeButton>
          <NudgeButton
            label={`Raise ${meta.label.toLowerCase()} by half a point`}
            disabled={final >= MAX_SCORE}
            onClick={() => onNudge(final + 0.5 - assessed.score)}
          >
            <Plus className="size-5" />
          </NudgeButton>
        </div>
      </section>

      <div className="mt-auto pt-8">
        <Button size="lg" className="w-full" onClick={onContinue}>
          {nextLabel}
          <ArrowRight className="size-5" />
        </Button>
      </div>
    </div>
  )
}

function NudgeButton({
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
      className="flex size-12 items-center justify-center rounded-full bg-paper text-ink shadow-card transition active:scale-90 disabled:opacity-35"
      {...props}
    >
      {children}
    </button>
  )
}

/** Six pips showing which rung of the scale an answer sat on. */
export function Rungs({ score, category }: { score: number; category: Category }) {
  const rung = ANCHORS.findIndex((a) => a === score)
  return (
    <span aria-hidden className="flex shrink-0 items-end gap-[3px]">
      {ANCHORS.map((_, i) => (
        <span
          key={i}
          className={cn('w-1.5 rounded-full', i <= rung ? categoryBg[category] : 'bg-line')}
          style={{ height: 6 + i * 2.5 }}
        />
      ))}
    </span>
  )
}
