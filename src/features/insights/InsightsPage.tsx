import { Plus } from 'lucide-react'
import { useMemo } from 'react'
import { ButtonLink } from '@/components/Button'
import { CookieRow } from '@/components/CookieRow'
import { LogoMark } from '@/components/Logo'
import { Card, Empty, Page, SectionTitle } from '@/components/Page'
import { ScoreBar } from '@/components/Score'
import { plural } from '@/lib/format'
import {
  CATEGORIES,
  CATEGORY_META,
  TEXTURE_STYLE_QUESTION_ID,
  formatScore,
  getQuestion,
  roundToHalf,
  tierFor,
} from '@/lib/rubric'
import { useSettings } from '@/lib/settings'
import {
  byAverageDesc,
  byNewest,
  disagreement,
  distribution,
  groupBy,
  groupByBakery,
  groupByType,
  summarize,
  type Group,
  type RatedCookie,
  type Disagreement,
} from '@/lib/stats'
import { useCookies } from '@/lib/use-cookies'
import { DistributionChart, TrendChart } from './Charts'

export function InsightsPage() {
  const cookies = useCookies()
  const { overallPrecision } = useSettings()

  const data = useMemo(() => {
    if (!cookies || cookies.length === 0) return null
    const summary = summarize(cookies)
    const styleQuestion = getQuestion(TEXTURE_STYLE_QUESTION_ID)
    const styles = groupBy(
      cookies.filter((c) => typeof c.answers[TEXTURE_STYLE_QUESTION_ID] === 'string'),
      (c) => {
        const key = c.answers[TEXTURE_STYLE_QUESTION_ID] as string
        const option =
          styleQuestion?.kind === 'context'
            ? styleQuestion.options.find((o) => o.id === key)
            : undefined
        return { key, label: option?.label ?? key }
      },
    ).sort(byAverageDesc)
    return {
      summary,
      bands: distribution(cookies),
      timeline: [...cookies].sort(byNewest).reverse(),
      bakeries: groupByBakery(cookies).sort(byAverageDesc).slice(0, 5),
      types: groupByType(cookies).sort(byAverageDesc).slice(0, 5),
      styles,
      fame: hallOfFame(cookies),
      versus: disagreement(cookies),
    }
  }, [cookies])

  if (!cookies) return null
  if (!data) {
    return (
      <Empty
        title="No numbers to crunch yet"
        art={<LogoMark className="size-20 opacity-60" />}
        action={
          <ButtonLink to="/rate">
            <Plus className="size-4" strokeWidth={2.6} />
            Rate a cookie
          </ButtonLink>
        }
      >
        Rate a few cookies and this page fills in with your averages, favorite bakeries and the
        cookies that set records.
      </Empty>
    )
  }

  const { summary, bands, timeline, bakeries, types, styles, fame, versus } = data
  const ranked = [...CATEGORIES].sort(
    (a, b) => summary.categoryAverages[b] - summary.categoryAverages[a],
  )
  const top = ranked[0]!
  const bottom = ranked.at(-1)!
  const spread = summary.categoryAverages[top] - summary.categoryAverages[bottom]
  const beat = Math.round((summary.aboveStandard / summary.count) * 100)

  return (
    <Page title="Insights" lede="What your cookie habit looks like in numbers.">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="Cookies rated"
          value={String(summary.count)}
          note={`from ${plural(summary.bakeries, 'bakery', 'bakeries')}`}
        />
        <Tile
          label="Average score"
          value={summary.average.toFixed(1)}
          note={tierFor(roundToHalf(summary.average)).name}
        />
        <Tile label="Beat the standard" value={`${beat}%`} note="scored above a 5" />
        <Tile
          label="Towns"
          value={String(summary.towns)}
          note={`in ${plural(summary.states, 'state')}`}
        />
      </dl>

      <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
        <Card>
          <SectionTitle>Your palate</SectionTitle>
          <p className="mt-1 text-sm text-ink-soft">
            {spread < 0.3
              ? 'You score taste, texture and appearance almost evenly.'
              : `Cookies tend to win you over on ${CATEGORY_META[top].label.toLowerCase()} and lose points on ${CATEGORY_META[bottom].label.toLowerCase()}.`}
          </p>
          <div className="mt-4 space-y-4">
            {CATEGORIES.map((c) => (
              <AverageBar key={c} category={c} average={summary.categoryAverages[c]} />
            ))}
          </div>
          {styles.length > 1 && (
            <p className="mt-4 border-t border-line/70 pt-3 text-sm text-ink-soft">
              Favorite texture so far:{' '}
              <strong className="font-semibold text-ink">{styles[0]!.label.toLowerCase()}</strong>{' '}
              cookies average {styles[0]!.average.toFixed(1)}.
            </p>
          )}
        </Card>

        <Card>
          <SectionTitle>Where your scores land</SectionTitle>
          <p className="mt-1 mb-3 text-sm text-ink-soft">
            Cookies by overall score. A 5 is the Toll House standard.
          </p>
          <DistributionChart data={bands} />
        </Card>

        {timeline.length >= 3 && (
          <Card className="lg:col-span-2">
            <SectionTitle>Cookie by cookie</SectionTitle>
            <p className="mt-1 mb-3 text-sm text-ink-soft">
              Overall score of every cookie, oldest to newest.
            </p>
            <TrendChart cookies={timeline} precision={overallPrecision} />
          </Card>
        )}

        {versus.count >= 3 && <Versus versus={versus} />}

        <Leaderboard title="Top bakeries" groups={bakeries} unit="cookie" />
        <Leaderboard title="Top cookie types" groups={types} unit="rated" />

        {fame.length > 0 && (
          <Card className="lg:col-span-2">
            <SectionTitle>Hall of fame</SectionTitle>
            <ul className="-mx-1.5 mt-3 grid grid-cols-1 gap-x-6 gap-y-1 md:grid-cols-2">
              {fame.map((entry) => (
                // Without a floor of zero a grid cell is as wide as its
                // longest line, and a long name pushed the page sideways.
                <li key={entry.title} className="min-w-0">
                  <CookieRow
                    cookie={entry.cookie}
                    precision={overallPrecision}
                    eyebrow={entry.title}
                    detail={`${entry.cookie.bakery} · ${entry.detail}`}
                  />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </Page>
  )
}

/** How the person's final scores compare with what the questionnaire suggested. */
function Versus({ versus }: { versus: Disagreement }) {
  const describe = (average: number) => {
    if (Math.abs(average) < 0.15) return 'You and the questions agree.'
    const amount = Math.abs(average).toFixed(1)
    return average > 0
      ? `You score about ${amount} higher than the questions suggest.`
      : `You score about ${amount} lower than the questions suggest.`
  }
  return (
    <Card className="lg:col-span-2">
      <SectionTitle>You vs. the questions</SectionTitle>
      <p className="mt-1 max-w-2xl text-sm text-ink-soft">
        Across {plural(versus.count, 'cookie')} scored with the questionnaire, this is how your
        final call compared with its suggestion. A steady gap one way means the questions run hot or
        cold for your taste there.
      </p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        {CATEGORIES.map((category) => {
          const { average, moved } = versus.byCategory[category]
          return (
            <div key={category} className="rounded-2xl bg-oat px-4 py-3">
              <dt className="text-sm font-semibold">{CATEGORY_META[category].label}</dt>
              <dd className="numerals mt-1 text-3xl font-semibold">
                {Math.abs(average) < 0.15
                  ? '±0'
                  : `${average > 0 ? '+' : '−'}${Math.abs(average).toFixed(1)}`}
              </dd>
              <dd className="mt-1 text-[13px] leading-snug text-ink-soft">
                {describe(average)} Changed {moved} of {versus.count}.
              </dd>
            </div>
          )
        })}
      </dl>
    </Card>
  )
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="flex flex-col rounded-3xl border border-line bg-paper p-4 shadow-card">
      <dt className="text-[13px] font-semibold text-ink-soft">{label}</dt>
      <dd className="order-first mb-1 font-sans text-[40px] leading-none font-semibold tabular-nums">
        {value}
      </dd>
      <dd className="mt-0.5 text-xs text-ink-faint">{note}</dd>
    </div>
  )
}

function AverageBar({
  category,
  average,
}: {
  category: (typeof CATEGORIES)[number]
  average: number
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-semibold">{CATEGORY_META[category].label}</span>
        <span className="numerals text-xl font-semibold">{average.toFixed(1)}</span>
      </div>
      <ScoreBar category={category} score={average} bare />
    </div>
  )
}

function Leaderboard({ title, groups, unit }: { title: string; groups: Group[]; unit: string }) {
  return (
    <Card>
      <SectionTitle>{title}</SectionTitle>
      <ol className="mt-3 space-y-3.5">
        {groups.map((group, i) => (
          <li key={group.key} className="flex items-center gap-3">
            <span className="numerals w-5 shrink-0 text-sm text-ink-faint">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate font-semibold">{group.label}</span>
                <span className="shrink-0 text-xs text-ink-faint">
                  {unit === 'cookie' ? plural(group.count, 'cookie') : `${group.count} rated`}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-oat">
                <div
                  className="h-full rounded-full bg-crust"
                  style={{ width: `${group.average * 10}%` }}
                />
              </div>
            </div>
            <span className="numerals w-9 shrink-0 text-right text-lg font-semibold">
              {group.average.toFixed(1)}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  )
}

interface FameEntry {
  title: string
  detail: string
  cookie: RatedCookie
}

/** Record holders, one row per cookie. */
function hallOfFame(cookies: RatedCookie[]): FameEntry[] {
  if (cookies.length < 3) return []
  const entries: FameEntry[] = []
  const add = (title: string, cookie: RatedCookie | undefined, detail: string) => {
    if (!cookie) return
    // A cookie that holds several records gets one row listing all of them.
    const held = entries.find((e) => e.cookie.id === cookie.id)
    if (held) held.title += ` · ${title}`
    else entries.push({ title, cookie, detail })
  }
  const top = (score: (c: RatedCookie) => number) =>
    [...cookies].sort((a, b) => score(b) - score(a) || b.overallExact - a.overallExact)[0]

  for (const category of CATEGORIES) {
    const best = top((c) => c.scores[category])
    const title = { taste: 'Best tasting', texture: 'Best texture', appearance: 'Best looking' }[
      category
    ]
    add(
      title,
      best,
      `${CATEGORY_META[category].label.toLowerCase()} ${formatScore(best?.scores[category] ?? 0)}`,
    )
  }
  const sleeper = top((c) => c.scores.taste - c.scores.appearance)
  if (sleeper && sleeper.scores.taste - sleeper.scores.appearance >= 1.5) {
    add(
      'Ugly delicious',
      sleeper,
      `tastes ${formatScore(sleeper.scores.taste)}, looks ${formatScore(sleeper.scores.appearance)}`,
    )
  }
  const showoff = top((c) => c.scores.appearance - c.scores.taste)
  if (showoff && showoff.scores.appearance - showoff.scores.taste >= 1.5) {
    add(
      'All show',
      showoff,
      `looks ${formatScore(showoff.scores.appearance)}, tastes ${formatScore(showoff.scores.taste)}`,
    )
  }
  return entries
}
