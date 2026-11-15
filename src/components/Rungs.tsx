import { categoryBg } from '@/components/category-styles'
import { cn } from '@/lib/cn'
import { ANCHORS, type Category } from '@/lib/rubric'

/**
 * Six pips showing roughly where a score sits on the scale: the worded rungs
 * of an old full tasting light exactly, a number from 1 to 10 lights the rung
 * at or below it.
 */
export function Rungs({ score, category }: { score: number; category: Category }) {
  const rung = ANCHORS.filter((anchor) => anchor <= score).length - 1
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
