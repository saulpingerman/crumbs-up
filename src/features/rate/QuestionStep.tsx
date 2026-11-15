import { ArrowRight, Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/Button'
import { categoryBg, categorySoft, categoryText } from '@/components/category-styles'
import { cn } from '@/lib/cn'
import {
  CATEGORY_META,
  STANDARD_OPTION_INDEX,
  STANDARD_SCORE,
  type Category,
  type ContextQuestion,
  type Option,
  type ScaleQuestion,
} from '@/lib/rubric'

const categoryBorder: Record<Category, string> = {
  taste: 'border-taste',
  texture: 'border-texture',
  appearance: 'border-look',
}

interface HeadingProps {
  category: Category
  index: number
  count: number
  prompt: string
  hint?: string
}

export function QuestionHeading({ category, index, count, prompt, hint }: HeadingProps) {
  const meta = CATEGORY_META[category]
  return (
    <header className="mb-5">
      <p className={cn('text-xs font-bold tracking-[0.14em] uppercase', categoryText[category])}>
        {meta.label} · {index} of {count}
      </p>
      <h1 className="mt-1.5 font-display text-[30px] leading-[1.1] font-semibold">{prompt}</h1>
      {hint && <p className="mt-2 text-[15px] leading-snug text-ink-soft">{hint}</p>}
    </header>
  )
}

/**
 * How long a question ignores taps after it appears. Answering moves on by
 * itself, so a second tap meant for the last screen would otherwise answer
 * this one before anyone had read it.
 */
const SETTLE_MS = 450

/**
 * The way forward, pinned to the bottom of the screen so it is never below
 * the fold. It swallows the page's own bottom padding, so it sits in the same
 * place whether it is stuck there or at rest.
 */
export function StickyFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-5 mt-auto -mb-[calc(1.25rem+env(safe-area-inset-bottom))] bg-gradient-to-t from-cream from-80% to-transparent px-5 pt-8 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
      {children}
    </div>
  )
}

interface ChoiceProps {
  question: ScaleQuestion | ContextQuestion
  index: number
  count: number
  value: string | undefined
  /** Text that replaces `{style}` in the prompt (the chosen texture style). */
  styleName?: string
  onChoose: (optionId: string) => void
  /** Move on without changing the answer (only offered on a revisit). */
  onNext: () => void
}

/** One single-answer question: a column of big, fully-worded choices. */
export function ChoiceStep({
  question,
  index,
  count,
  value,
  styleName,
  onChoose,
  onNext,
}: ChoiceProps) {
  // Answering moves on by itself. Coming back to a question that already has
  // an answer needs an explicit way forward that doesn't involve re-tapping.
  const [revisit] = useState(value !== undefined)
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(true), SETTLE_MS)
    return () => clearTimeout(timer)
  }, [])
  const offered = question.options.filter((o) => !o.retired)
  const numbered = question.kind === 'scale' && question.numbered === true
  const scored = offered.filter((o) => o.score !== null)
  const notApplicable = offered.filter((o) => o.score === null && question.kind === 'scale')
  // A number scale reads best from the top down; worded rungs from the bottom up.
  const list = question.kind === 'scale' ? (numbered ? [...scored].reverse() : scored) : offered

  // Number keys answer the question on a keyboard: on a number scale the key
  // is the score itself (0 for 10), otherwise the choice's place in the list.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const n = Number(e.key)
      if (!Number.isInteger(n) || !settled) return
      const option = numbered
        ? scored.find((o) => o.score === (n === 0 ? 10 : n))
        : n >= 1
          ? list[n - 1]
          : undefined
      if (option) onChoose(option.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [list, scored, numbered, onChoose, settled])

  const prompt = styleName ? question.prompt.replace('that style', styleName) : question.prompt

  return (
    <div className="flex flex-1 flex-col">
      <QuestionHeading
        category={question.category}
        index={index}
        count={count}
        prompt={prompt}
        hint={question.hint}
      />
      <div role="radiogroup" aria-label={question.title} className="space-y-2">
        {/* "Doesn't apply" sits first so it is never hidden below the fold. */}
        {notApplicable.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={value === option.id}
            disabled={!settled}
            onClick={() => onChoose(option.id)}
            className={cn(
              'mb-1 w-full rounded-2xl border border-dashed px-4 py-2.5 text-left text-sm transition active:scale-[0.99]',
              value === option.id
                ? cn(categoryBorder[question.category], categorySoft[question.category])
                : 'border-ink-faint/60 text-ink-soft hover:border-ink-faint',
            )}
          >
            <span className="font-semibold text-ink">{option.label}</span> · {option.detail}
          </button>
        ))}
        {list.map((option, i) =>
          numbered ? (
            <NumberButton
              key={option.id}
              option={option}
              category={question.category}
              selected={value === option.id}
              disabled={!settled}
              onChoose={onChoose}
            />
          ) : (
            <ChoiceButton
              key={option.id}
              option={option}
              category={question.category}
              selected={value === option.id}
              standard={question.kind === 'scale' && i === STANDARD_OPTION_INDEX}
              disabled={!settled}
              onChoose={onChoose}
            />
          ),
        )}
      </div>
      {revisit && value !== undefined && (
        <StickyFooter>
          <Button variant="soft" size="lg" className="w-full" onClick={onNext}>
            Keep this answer
            <ArrowRight className="size-5" />
          </Button>
        </StickyFooter>
      )}
    </div>
  )
}

/** One number on a 1 to 10 scale: the number, its name, and what it means here. */
function NumberButton({
  option,
  category,
  selected,
  disabled,
  onChoose,
}: {
  option: Option
  category: Category
  selected: boolean
  disabled: boolean
  onChoose: (id: string) => void
}) {
  const standard = option.score === STANDARD_SCORE
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`${option.score} ${option.label}: ${option.detail ?? ''}`}
      disabled={disabled}
      onClick={() => onChoose(option.id)}
      className={cn(
        'flex min-h-[56px] w-full items-center gap-3 rounded-2xl border-[1.5px] px-3 py-2 text-left transition duration-150 active:scale-[0.985]',
        selected
          ? cn(categoryBorder[category], categorySoft[category])
          : standard
            ? 'border-ink-faint/50 bg-oat/60 hover:border-ink-faint'
            : 'border-line bg-paper hover:border-ink-faint',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'numerals flex size-10 shrink-0 items-center justify-center rounded-xl font-display text-[22px] font-semibold transition',
          selected ? cn(categoryBg[category], 'text-white dark:text-black') : 'bg-oat text-ink',
        )}
      >
        {option.score}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] leading-tight font-semibold">{option.label}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-ink-soft">{option.detail}</span>
      </span>
    </button>
  )
}

function ChoiceButton({
  option,
  category,
  selected,
  standard,
  disabled,
  onChoose,
}: {
  option: Option
  category: Category
  selected: boolean
  standard: boolean
  disabled: boolean
  onChoose: (id: string) => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={() => onChoose(option.id)}
      className={cn(
        'flex min-h-[60px] w-full items-center gap-3 rounded-2xl border-[1.5px] px-4 py-2.5 text-left transition duration-150 active:scale-[0.985]',
        selected
          ? cn(categoryBorder[category], categorySoft[category])
          : 'border-line bg-paper hover:border-ink-faint',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2">
          <span className="text-[16px] leading-tight font-semibold">{option.label}</span>
          {standard && (
            <span className="rounded-full bg-oat px-2 py-0.5 text-[10px] font-bold tracking-wider text-ink-soft uppercase">
              Average
            </span>
          )}
        </span>
        {option.detail && (
          <span className="mt-0.5 block text-[13.5px] leading-snug text-ink-soft">
            {option.detail}
          </span>
        )}
      </span>
      <span
        aria-hidden
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-full border-[1.5px] transition',
          selected
            ? cn(categoryBg[category], 'border-transparent text-white dark:text-black')
            : 'border-line',
        )}
      >
        {selected && <Check className="size-4" strokeWidth={3} />}
      </span>
    </button>
  )
}
