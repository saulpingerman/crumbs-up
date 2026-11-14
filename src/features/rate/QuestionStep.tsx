import { Check } from 'lucide-react'
import { useEffect } from 'react'
import { Button } from '@/components/Button'
import { categoryBg, categorySoft, categoryText } from '@/components/category-styles'
import { cn } from '@/lib/cn'
import {
  CATEGORY_META,
  STANDARD_OPTION_INDEX,
  type Category,
  type ContextQuestion,
  type FlawQuestion,
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

interface ChoiceProps {
  question: ScaleQuestion | ContextQuestion
  index: number
  count: number
  value: string | undefined
  /** Text that replaces `{style}` in the prompt (the chosen texture style). */
  styleName?: string
  onChoose: (optionId: string) => void
}

/** One single-answer question: a column of big, fully-worded choices. */
export function ChoiceStep({ question, index, count, value, styleName, onChoose }: ChoiceProps) {
  const scored = question.options.filter((o) => o.score !== null)
  const notApplicable = question.options.filter(
    (o) => o.score === null && question.kind === 'scale',
  )
  const list = question.kind === 'scale' ? scored : question.options

  // Number keys answer the question on a keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const n = Number(e.key)
      const option = Number.isInteger(n) && n >= 1 ? list[n - 1] : undefined
      if (option) onChoose(option.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [list, onChoose])

  const prompt = styleName ? question.prompt.replace('that style', styleName) : question.prompt

  return (
    <div>
      <QuestionHeading
        category={question.category}
        index={index}
        count={count}
        prompt={prompt}
        hint={question.hint}
      />
      <div role="radiogroup" aria-label={question.title} className="space-y-2">
        {list.map((option, i) => (
          <ChoiceButton
            key={option.id}
            option={option}
            category={question.category}
            selected={value === option.id}
            standard={question.kind === 'scale' && i === STANDARD_OPTION_INDEX}
            onChoose={onChoose}
          />
        ))}
      </div>
      {notApplicable.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          onClick={() => onChoose(option.id)}
          className={cn(
            'mt-4 w-full rounded-2xl border border-dashed px-4 py-3 text-left text-sm transition active:scale-[0.99]',
            value === option.id
              ? cn(categoryBorder[question.category], categorySoft[question.category])
              : 'border-line text-ink-soft hover:border-ink-faint',
          )}
        >
          <span className="font-semibold text-ink">{option.label}</span> — {option.detail}
        </button>
      ))}
    </div>
  )
}

function ChoiceButton({
  option,
  category,
  selected,
  standard,
  onChoose,
}: {
  option: Option
  category: Category
  selected: boolean
  standard: boolean
  onChoose: (id: string) => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
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
              The standard
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

interface FlawProps {
  question: FlawQuestion
  index: number
  count: number
  value: string[]
  onChange: (flawIds: string[]) => void
  onContinue: () => void
}

/** The "anything off?" check: tap any flaws, or sail straight through. */
export function FlawStep({ question, index, count, value, onChange, onContinue }: FlawProps) {
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])

  return (
    <div className="flex flex-1 flex-col">
      <QuestionHeading
        category={question.category}
        index={index}
        count={count}
        prompt={question.prompt}
        hint={question.hint}
      />
      <div role="group" aria-label={question.title} className="flex flex-wrap gap-2">
        {question.flaws.map((flaw) => {
          const on = value.includes(flaw.id)
          return (
            <button
              key={flaw.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(flaw.id)}
              className={cn(
                'flex h-11 items-center gap-1.5 rounded-full border-[1.5px] px-4 text-[15px] font-medium transition active:scale-95',
                on
                  ? 'border-danger bg-danger-soft text-danger'
                  : 'border-line bg-paper text-ink hover:border-ink-faint',
              )}
            >
              {on && <Check className="size-4" strokeWidth={3} />}
              {flaw.label}
            </button>
          )
        })}
      </div>
      <div className="mt-auto pt-8">
        <Button size="lg" className="w-full" onClick={onContinue}>
          {value.length === 0 ? 'No flaws — carry on' : `Continue with ${value.length} flagged`}
        </Button>
      </div>
    </div>
  )
}
