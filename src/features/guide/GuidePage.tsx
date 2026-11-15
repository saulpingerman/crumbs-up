import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router'
import { Card, Page, SectionTitle } from '@/components/Page'
import { categoryText } from '@/components/category-styles'
import { cn } from '@/lib/cn'
import {
  CATEGORY_META,
  QUICK_QUESTIONS,
  TASTING_ORDER,
  TIERS,
  WEIGHT_PRESETS,
  formatScore,
  type Category,
} from '@/lib/rubric'
import { useSettings } from '@/lib/settings'

/**
 * Everything on this page is generated from the rubric itself, so it can
 * never drift from what the rating screens actually ask.
 */
export function GuidePage() {
  const { weightPreset } = useSettings()
  return (
    <Page
      title="How the scoring works"
      kicker="The rule book"
      lede="A number for each, words for every number, and no mystery math."
      className="max-w-2xl"
      action={
        <Link
          to="/settings"
          className="flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink"
        >
          <ArrowLeft className="size-4" /> Settings
        </Link>
      }
    >
      <div className="space-y-5">
        <Card>
          <SectionTitle>The scale: 5 is average</SectionTitle>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
            Every score is out of 10, and a 5 is an average cookie: good, nothing special. A bakery
            has to beat that to climb, and has to fumble to fall below it.
          </p>
          <ol className="mt-4 divide-y divide-line/70">
            {TIERS.map((tier, i) => {
              const upper = i === 0 ? null : TIERS[i - 1]!.min - 0.5
              const low = Math.max(1, tier.min)
              return (
                <li key={tier.name} className="flex items-baseline gap-3 py-2">
                  <span className="numerals w-16 shrink-0 text-[15px] font-semibold">
                    {upper === null || upper === low
                      ? formatScore(low)
                      : `${formatScore(low)}–${formatScore(upper)}`}
                  </span>
                  <span
                    className={cn('w-36 shrink-0 font-semibold', tier.min === 5 && 'text-crust')}
                  >
                    {tier.name}
                  </span>
                  <span className="hidden text-sm text-ink-soft sm:block">{tier.line}</span>
                </li>
              )
            })}
          </ol>
        </Card>

        <Card>
          <SectionTitle>A number for each</SectionTitle>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
            Rate how it looks, then its texture, then its taste: the order you meet a cookie. Each
            gets a number from 1 to 10, and every number comes with words, so a 7 means the same
            thing each time. On the verdict, − and + fine-tune a score by half a point.
          </p>
          <div className="mt-4 space-y-5">
            {TASTING_ORDER.map((category) => (
              <CategoryNumbers key={category} category={category} />
            ))}
          </div>
        </Card>

        <Card>
          <SectionTitle>The overall score</SectionTitle>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
            The three category scores combine into one. You choose how in{' '}
            <Link to="/settings" className="font-semibold text-ink underline">
              Settings
            </Link>
            :
          </p>
          <ul className="mt-3 space-y-2">
            {(Object.keys(WEIGHT_PRESETS) as (keyof typeof WEIGHT_PRESETS)[]).map((key) => (
              <li
                key={key}
                className={cn(
                  'rounded-2xl px-4 py-3',
                  key === weightPreset ? 'bg-texture-soft' : 'bg-oat',
                )}
              >
                <p className="font-semibold">
                  {WEIGHT_PRESETS[key].label}
                  {key === weightPreset && (
                    <span className="ml-2 text-[11px] font-bold tracking-wider text-crust uppercase">
                      In use
                    </span>
                  )}
                </p>
                <p className="text-sm text-ink-soft">{WEIGHT_PRESETS[key].detail}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </Page>
  )
}

function CategoryNumbers({ category }: { category: Category }) {
  const meta = CATEGORY_META[category]
  const numbers = QUICK_QUESTIONS[category].options
    .filter((o) => !o.retired && o.score !== null)
    .reverse()
  return (
    <section>
      <h3 className={cn('text-xs font-bold tracking-[0.14em] uppercase', categoryText[category])}>
        {meta.verb} · {meta.label}
      </h3>
      <ol className="mt-2 divide-y divide-line/70">
        {numbers.map((option) => (
          <li key={option.id} className="flex items-baseline gap-3 py-1.5">
            <span className="numerals w-6 shrink-0 text-right font-semibold">{option.score}</span>
            <span className="min-w-0 text-[15px]">
              <span className="font-semibold">{option.label}</span>
              <span className="text-ink-soft"> · {option.detail}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
