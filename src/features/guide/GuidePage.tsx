import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router'
import { Card, Page, SectionTitle } from '@/components/Page'
import { categoryBg, categoryText } from '@/components/category-styles'
import { cn } from '@/lib/cn'
import {
  ANCHORS,
  CATEGORY_META,
  MAX_FLAW_PENALTY,
  QUESTIONS,
  TASTING_ORDER,
  TIERS,
  WEIGHT_PRESETS,
  formatScore,
  type Category,
} from '@/lib/rubric'
import { useSettings } from '@/lib/settings'

const RUNG_NAMES = ['Bad', 'Below standard', 'The standard', 'Better', 'Excellent', 'Best ever']

/**
 * Everything on this page is generated from the rubric itself, so it can
 * never drift from what the questionnaire actually does.
 */
export function GuidePage() {
  const { weightPreset } = useSettings()
  return (
    <Page
      title="How the scoring works"
      kicker="The rule book"
      lede="Worded questions, one fixed reference point, and no mystery math."
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
          <SectionTitle>One anchor: a 5 is a Toll House cookie</SectionTitle>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
            Every score is measured against the same thing: the classic chocolate chip cookie from
            the back of the bag. Good, nothing special. That’s a 5. A bakery has to beat it to
            climb, and has to fumble to fall below it.
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
          <SectionTitle>Look, bite, savor</SectionTitle>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
            The questions follow the order you actually meet a cookie: how it looks before you touch
            it, how it eats, then how it tastes. In a full tasting each category asks five scored
            questions and then checks for flaws. Heavier bars count for more.
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
            Short on time? A <strong className="font-semibold text-ink">quick review</strong> asks
            one overall question for each of the three instead, on the same rungs and scale, and
            lets you fine-tune the scores by half points on the verdict. You pick which before you
            start.
          </p>
          <div className="mt-4 space-y-5">
            {TASTING_ORDER.map((category) => (
              <CategoryQuestions key={category} category={category} />
            ))}
          </div>
        </Card>

        <Card>
          <SectionTitle>From answers to a score</SectionTitle>
          <ol className="mt-3 space-y-4 text-[15px] leading-relaxed text-ink-soft">
            <li>
              <strong className="font-semibold text-ink">Every answer sits on a rung.</strong> The
              choices are worded, never numbered, so you describe the cookie instead of grading it.
              Behind the words, each rung carries a value:
              <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                {ANCHORS.map((value, i) => (
                  <li
                    key={value}
                    className={cn(
                      'rounded-xl px-2 py-2 text-center',
                      i === 2 ? 'bg-texture-soft' : 'bg-oat',
                    )}
                  >
                    <span className="numerals block text-xl font-semibold text-ink">
                      {formatScore(value)}
                    </span>
                    <span className="block text-[11px] leading-tight font-medium">
                      {RUNG_NAMES[i]}
                    </span>
                  </li>
                ))}
              </ul>
              <span className="mt-2 block text-sm">
                There are three rungs above the standard and two below, because bakery cookies
                mostly live above the line, and that’s where the detail is needed.
              </span>
            </li>
            <li>
              <strong className="font-semibold text-ink">
                The category score is their weighted average.
              </strong>{' '}
              A question marked “doesn’t apply” (mix-ins on a plain shortbread, say) is left out
              rather than counted as average.
            </li>
            <li>
              <strong className="font-semibold text-ink">Flaws cost points.</strong> Each flaw you
              flag takes off half a point or a full point, up to {formatScore(MAX_FLAW_PENALTY)} per
              category.
            </li>
            <li>
              <strong className="font-semibold text-ink">It’s rounded to the half point</strong>,
              and kept between 1 and 10. A 10 takes the top answer on every question, so it stays
              rare.
            </li>
            <li>
              <strong className="font-semibold text-ink">You get the last word.</strong> The result
              is a suggestion. Nudge it up or down and the journal remembers both numbers.
            </li>
          </ol>
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

function CategoryQuestions({ category }: { category: Category }) {
  const meta = CATEGORY_META[category]
  const scored = QUESTIONS[category].filter((q) => q.kind === 'scale')
  const flaws = QUESTIONS[category].find((q) => q.kind === 'flaws')
  const heaviest = Math.max(...scored.map((q) => q.weight))
  const total = scored.reduce((sum, q) => sum + q.weight, 0)

  return (
    <section>
      <h3 className={cn('text-xs font-bold tracking-[0.14em] uppercase', categoryText[category])}>
        {meta.verb} · {meta.label}
      </h3>
      <ul className="mt-2 space-y-2">
        {scored.map((q) => (
          <li key={q.id} className="flex items-center gap-3">
            <span className="w-36 shrink-0 text-[15px] font-semibold sm:w-44">{q.title}</span>
            <span className="h-2 flex-1 rounded-full bg-oat">
              <span
                className={cn('block h-full rounded-full', categoryBg[category])}
                style={{ width: `${(q.weight / heaviest) * 100}%` }}
              />
            </span>
            <span className="w-9 shrink-0 text-right text-sm text-ink-soft tabular-nums">
              {Math.round((q.weight / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
      {flaws?.kind === 'flaws' && (
        <p className="mt-2 text-sm text-ink-soft">
          Flaws checked: {flaws.flaws.map((f) => f.label.toLowerCase()).join(', ')}.
        </p>
      )}
    </section>
  )
}
