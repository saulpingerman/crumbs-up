import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  LoaderCircle,
  MapPin,
  Pencil,
  Share2,
  Tag,
  Trash2,
  Trophy,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { NotFound } from '@/app/Errors'
import { Button, ButtonLink, IconButton } from '@/components/Button'
import { CookiePhoto } from '@/components/CookiePhoto'
import { Medallion, ScoreBar } from '@/components/Score'
import { categoryText } from '@/components/category-styles'
import { Confirm } from '@/components/Sheet'
import { cn } from '@/lib/cn'
import { deleteCookie } from '@/lib/db/cookies'
import { formatDate, formatPlace, formatPrice } from '@/lib/format'
import {
  CATEGORIES,
  CATEGORY_META,
  QUICK_QUESTIONS,
  TASTING_ORDER,
  TEXTURE_STYLE_QUESTION_ID,
  assessCategory,
  formatScore,
  getQuestion,
  isQuickReview,
  quickAnswer,
  tierFor,
  type Category,
} from '@/lib/rubric'
import { useSettings } from '@/lib/settings'
import { shareImage, slug } from '@/lib/share'
import { stateName } from '@/lib/states'
import { bakeryKey, byScoreDesc, type RatedCookie } from '@/lib/stats'
import { useCookie, useCookies } from '@/lib/use-cookies'
import { useCountUp } from '@/lib/use-count-up'
import { forgetPhoto, useCookieImage } from '@/lib/use-photo'
import { useTitle } from '@/lib/use-title'
import { Rungs } from '../rate/ResultStep'
import { ShareCard, SHARE_HEIGHT, SHARE_WIDTH } from './ShareCard'

export function CookiePage() {
  const { id } = useParams()
  const cookie = useCookie(id)
  const navigate = useNavigate()
  const location = useLocation()
  // Captured once: the flag is cleared from history below, so reloading or
  // coming back to this page doesn't replay the celebration.
  const [fresh] = useState(() => (location.state as { fresh?: boolean } | null)?.fresh === true)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!fresh) return
    toast.success('Saved to your journal', { id: 'saved' })
    void navigate('.', { replace: true, state: null })
  }, [fresh, navigate])

  useTitle(cookie ? `${cookie.cookieType} · ${cookie.bakery}` : null)

  if (cookie === undefined) return <div className="min-h-dvh" aria-busy />
  if (cookie === null) return <NotFound />

  const back = () => {
    const index = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (index > 0) void navigate(-1)
    else void navigate('/', { replace: true })
  }

  async function remove() {
    if (!cookie) return
    await deleteCookie(cookie.id)
    forgetPhoto(cookie.id)
    toast('Cookie deleted')
    void navigate('/', { replace: true })
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-5xl md:px-6 md:py-8">
      <div className="md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:items-start md:gap-10">
        <div className="relative md:sticky md:top-8">
          <CookiePhoto
            cookie={cookie}
            kind="full"
            className="aspect-square w-full md:rounded-[28px] md:shadow-pop"
          />
          <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
            <IconButton label="Back" tone="glass" onClick={back}>
              <ArrowLeft className="size-5" />
            </IconButton>
            {(cookie.sample || !cookie.hasPhoto) && (
              <span className="rounded-full bg-black/45 px-3 py-1.5 text-xs font-bold tracking-wider text-white uppercase backdrop-blur-md">
                {cookie.sample ? 'Sample' : 'Illustration'}
              </span>
            )}
          </div>
        </div>

        <div className="relative -mt-7 rounded-t-[28px] bg-cream px-5 pt-6 pb-[calc(2.5rem+env(safe-area-inset-bottom))] md:mt-0 md:rounded-none md:px-0 md:pt-2">
          <Headline cookie={cookie} animate={fresh} />

          <section className="mt-6 space-y-4 rounded-3xl border border-line bg-paper p-5 shadow-card">
            {CATEGORIES.map((c) => (
              <ScoreBar key={c} category={c} score={cookie.scores[c]} />
            ))}
            <p className="flex items-center justify-center gap-1.5 border-t border-line/70 pt-3 text-xs font-medium text-ink-faint">
              <span aria-hidden className="inline-block h-3 w-0.5 rounded-full bg-ink/35" />
              The notch marks 5 — a standard Toll House cookie
            </p>
          </section>

          <Standing cookie={cookie} />

          {cookie.notes && (
            <section className="mt-6">
              <h2 className="text-sm font-bold">Tasting notes</h2>
              <p className="mt-1.5 font-display text-[19px] leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap text-ink">
                {cookie.notes}
              </p>
            </section>
          )}

          <Breakdown cookie={cookie} />

          <div className="mt-8 flex flex-wrap gap-2">
            <ShareButton cookie={cookie} />
            <ButtonLink variant="secondary" to={`/rate?edit=${cookie.id}`}>
              <Pencil className="size-4" />
              Edit
            </ButtonLink>
            <Button
              variant="ghost"
              onClick={() => setConfirmDelete(true)}
              className="ml-auto text-danger hover:bg-danger-soft hover:text-danger"
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
          </div>
        </div>
      </div>

      <Confirm
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this cookie?"
        description={
          <>
            The {cookie.cookieType} from {cookie.bakery}, its photo and its scores will be removed
            from your journal for good.
          </>
        }
        confirmLabel="Delete cookie"
        destructive
        onConfirm={() => void remove()}
      />
    </main>
  )
}

function Headline({ cookie, animate }: { cookie: RatedCookie; animate: boolean }) {
  const { overallPrecision } = useSettings()
  const tier = tierFor(cookie.overall)
  const counted = useCountUp(cookie.overall, 1000, animate ? 1 : cookie.overall)
  const step = overallPrecision === 'half' ? 2 : 10
  const shown = Math.round(counted * step) / step

  return (
    <header className="flex items-start gap-4">
      {/* A pasted link or a long made-up word must wrap, not widen the page. */}
      <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        <p className="text-xs font-bold tracking-[0.14em] text-crust uppercase">{tier.name}</p>
        <h1 className="mt-1 font-display text-[34px] leading-[1.05] font-semibold md:text-5xl">
          {cookie.cookieType}
        </h1>
        <p className="mt-2 text-[17px] font-semibold">{cookie.bakery}</p>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-soft">
          <li className="flex items-center gap-1.5">
            <MapPin className="size-4" aria-hidden />
            {formatPlace(cookie)}
          </li>
          <li className="flex items-center gap-1.5">
            <CalendarDays className="size-4" aria-hidden />
            {formatDate(cookie.eatenOn)}
          </li>
          {cookie.price !== null && (
            <li className="flex items-center gap-1.5">
              <Tag className="size-4" aria-hidden />
              {formatPrice(cookie.price)}
            </li>
          )}
        </ul>
      </div>
      <div className="flex shrink-0 flex-col items-center">
        <Medallion
          value={formatScore(shown, overallPrecision)}
          label={`Overall score ${formatScore(cookie.overall, overallPrecision)} out of 10`}
          size="lg"
          className={cn(animate && 'animate-pop')}
        />
        <span className="mt-1.5 text-[11px] font-bold tracking-[0.12em] text-ink-faint uppercase">
          Overall
        </span>
      </div>
    </header>
  )
}

/** Where this cookie stands against the rest of the journal. */
function Standing({ cookie }: { cookie: RatedCookie }) {
  const all = useCookies()
  const facts = useMemo(() => {
    if (!all || all.length < 2) return []
    const rankIn = (list: RatedCookie[]) =>
      [...list].sort(byScoreDesc).findIndex((c) => c.id === cookie.id) + 1
    const out: string[] = [`#${rankIn(all)} of ${all.length} cookies`]

    const inState = all.filter((c) => c.state === cookie.state)
    if (inState.length > 1) {
      const rank = rankIn(inState)
      out.push(
        rank === 1
          ? `Best in ${stateName(cookie.state)}`
          : `#${rank} in ${stateName(cookie.state)}`,
      )
    }
    const type = cookie.cookieType.trim().toLowerCase()
    const sameType = all.filter((c) => c.cookieType.trim().toLowerCase() === type)
    if (sameType.length > 1) {
      const rank = rankIn(sameType)
      out.push(
        `${rank === 1 ? 'Best' : `#${rank}`} ${cookie.cookieType.toLowerCase()} of ${sameType.length}`,
      )
    }
    const sameBakery = all.filter((c) => bakeryKey(c) === bakeryKey(cookie))
    if (sameBakery.length > 1) {
      const rank = rankIn(sameBakery)
      out.push(`${rank === 1 ? 'Best' : `#${rank}`} of ${sameBakery.length} from ${cookie.bakery}`)
    }
    return out
  }, [all, cookie])

  if (facts.length === 0) return null
  return (
    <ul className="mt-4 flex flex-wrap gap-2">
      {facts.map((fact, i) => (
        <li
          key={fact}
          className="flex items-center gap-1.5 rounded-full bg-oat px-3 py-1.5 text-[13px] font-semibold"
        >
          {i === 0 && <Trophy className="size-3.5 text-crust" aria-hidden />}
          {fact}
        </li>
      ))}
    </ul>
  )
}

/** The answers behind each score. */
function Breakdown({ cookie }: { cookie: RatedCookie }) {
  // Only a fully answered questionnaire explains the scores in detail. A
  // quick review has one answer behind each of them.
  const hasAnswers = CATEGORIES.every((c) => assessCategory(c, cookie.answers).complete)
  const quick = !hasAnswers && isQuickReview(cookie.answers)
  const styleQuestion = getQuestion(TEXTURE_STYLE_QUESTION_ID)
  const styleAnswer = cookie.answers[TEXTURE_STYLE_QUESTION_ID]
  const style =
    styleQuestion?.kind === 'context'
      ? styleQuestion.options.find((o) => o.id === styleAnswer)
      : undefined

  return (
    <section className="mt-8">
      <h2 className="font-display text-xl font-semibold">How it earned its scores</h2>
      {quick ? (
        <>
          <p className="mt-1.5 text-sm text-ink-soft">
            A quick review: one overall answer behind each score. Choose{' '}
            <strong className="font-semibold text-ink">Edit</strong> to do the full tasting.
          </p>
          <div className="mt-3 space-y-2">
            {TASTING_ORDER.map((category) => (
              <CategoryBreakdown key={category} category={category} cookie={cookie} quick />
            ))}
          </div>
        </>
      ) : !hasAnswers ? (
        <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
          These scores were entered by hand, so there are no questionnaire answers behind them.
          Choose <strong className="font-semibold text-ink">Edit</strong> to run the questions for
          this cookie.
        </p>
      ) : (
        <>
          {style && (
            <p className="mt-1.5 text-sm text-ink-soft">
              Texture style: <span className="font-semibold text-ink">{style.label}</span>
            </p>
          )}
          <div className="mt-3 space-y-2">
            {TASTING_ORDER.map((category) => (
              <CategoryBreakdown key={category} category={category} cookie={cookie} />
            ))}
          </div>
        </>
      )}
    </section>
  )
}

function CategoryBreakdown({
  category,
  cookie,
  quick = false,
}: {
  category: Category
  cookie: RatedCookie
  /** Scored from the one quick question rather than the full set. */
  quick?: boolean
}) {
  const assessed = assessCategory(category, cookie.answers)
  const picked = quick ? quickAnswer(category, cookie.answers) : undefined
  const lines =
    picked && picked.score !== null
      ? [{ question: QUICK_QUESTIONS[category], option: picked, score: picked.score }]
      : assessed.lines
  const recorded = cookie.scores[category]
  const suggested = cookie.suggested[category]
  const moved = recorded - suggested

  return (
    <details className="group rounded-2xl border border-line bg-paper open:shadow-card">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-3.5 [&::-webkit-details-marker]:hidden">
        <span className="flex-1 font-semibold">{CATEGORY_META[category].label}</span>
        <span className={cn('numerals text-xl font-semibold', categoryText[category])}>
          {formatScore(recorded)}
        </span>
        <ChevronDown
          className="size-4 text-ink-faint transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="px-4 pb-3">
        <ul className="divide-y divide-line/70 border-t border-line/70">
          {lines.map((line) => (
            <li key={line.question.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-ink-soft">{line.question.title}</p>
                <p className="text-[15px] font-semibold">
                  {line.option.label}
                  {line.option.detail && (
                    <span className="font-normal text-ink-soft"> — {line.option.detail}</span>
                  )}
                </p>
              </div>
              <Rungs score={line.score} category={category} />
            </li>
          ))}
          {assessed.flaws.map((flaw) => (
            <li
              key={flaw.id}
              className="flex items-center justify-between gap-3 py-2.5 text-danger"
            >
              <p className="text-[15px] font-semibold">{flaw.label}</p>
              <span className="numerals text-[15px] font-semibold">
                −{formatScore(flaw.penalty)}
              </span>
            </li>
          ))}
        </ul>
        {moved !== 0 && (
          <p className="mt-2 text-[13px] text-ink-soft">
            {quick ? 'Your answer' : 'The questions'} suggested {formatScore(suggested)}; you moved
            it {moved > 0 ? 'up' : 'down'} to {formatScore(recorded)}.
          </p>
        )}
      </div>
    </details>
  )
}

function ShareButton({ cookie }: { cookie: RatedCookie }) {
  const { overallPrecision } = useSettings()
  const [busy, setBusy] = useState(false)
  const card = useRef<HTMLDivElement>(null)
  // The card only exists while an image is being made.
  const { url: photoUrl } = useCookieImage(cookie, 'full', busy)
  const ready = busy && photoUrl !== null

  useEffect(() => {
    if (!ready) return
    let cancelled = false
    void (async () => {
      try {
        const node = card.current
        if (!node) return
        await document.fonts.ready
        await Promise.all(
          [...node.querySelectorAll('img')].map((img) => img.decode().catch(() => {})),
        )
        const { domToBlob } = await import('modern-screenshot')
        const blob = await domToBlob(node, {
          width: SHARE_WIDTH,
          height: SHARE_HEIGHT,
          scale: 1,
          type: 'image/png',
        })
        if (cancelled) return
        const outcome = await shareImage(
          blob,
          `crumbs-up-${slug(`${cookie.cookieType} ${cookie.bakery}`)}.png`,
          `${cookie.cookieType} from ${cookie.bakery}: ${formatScore(cookie.overall, overallPrecision)}/10 on Crumbs Up`,
        )
        if (outcome === 'downloaded') toast.success('Scorecard saved to your downloads')
      } catch (error) {
        console.error(error)
        toast.error('Couldn’t make the scorecard')
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ready, cookie, overallPrecision])

  return (
    <>
      <Button onClick={() => setBusy(true)} disabled={busy}>
        {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Share2 className="size-4" />}
        Share scorecard
      </Button>
      {busy &&
        createPortal(
          // Rendered off-screen at full size; never visible, only photographed.
          // It is parked by its own width, not the screen's: the card is far
          // wider than a phone, so "two screens to the left" left its edge
          // showing for as long as the share sheet stayed open.
          <div
            aria-hidden
            className="pointer-events-none fixed top-0"
            style={{ left: -(SHARE_WIDTH + 200) }}
            data-testid="share-card"
          >
            <ShareCard
              ref={card}
              cookie={cookie}
              photoUrl={photoUrl}
              precision={overallPrecision}
            />
          </div>,
          document.body,
        )}
    </>
  )
}
