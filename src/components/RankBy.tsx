import { categoryBg } from '@/components/category-styles'
import { cn } from '@/lib/cn'
import { CATEGORIES, CATEGORY_META, type RankBy } from '@/lib/rubric'

const OPTIONS: { value: RankBy; label: string }[] = [
  { value: 'overall', label: 'Overall' },
  ...CATEGORIES.map((c) => ({ value: c, label: CATEGORY_META[c].label })),
]

/** Overall, or one of the three on its own, for ordering a list. */
export function RankByChips({
  value,
  onChange,
  className,
}: {
  value: RankBy
  onChange: (value: RankBy) => void
  className?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Rank by"
      className={cn('no-scrollbar flex gap-1.5 overflow-x-auto', className)}
    >
      {OPTIONS.map((option) => {
        const on = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition active:scale-95',
              on
                ? 'border-ink bg-ink text-cream'
                : 'border-line bg-paper text-ink-soft hover:text-ink',
            )}
          >
            {option.value !== 'overall' && (
              <span aria-hidden className={cn('size-2 rounded-full', categoryBg[option.value])} />
            )}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
