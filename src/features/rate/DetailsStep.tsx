import { ArrowRight, History, PencilLine } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { Button } from '@/components/Button'
import { Field, Select, TextInput } from '@/components/Field'
import { COMMON_COOKIE_TYPES } from '@/lib/cookie-types'
import { todayIso } from '@/lib/format'
import { ELSEWHERE, US_STATES } from '@/lib/states'
import { byNewest } from '@/lib/stats'
import { useCookies } from '@/lib/use-cookies'
import { PhotoPicker } from './PhotoPicker'
import { validateDetails, type DetailErrors } from './steps'
import type { DraftApi } from './useDraft'

interface Props {
  api: DraftApi
  editId: string | null
  onContinue: () => void
  onManual: () => void
  onResume?: () => void
}

/** Case-insensitive, de-duplicated, most recent first. */
function distinct(values: string[]): string[] {
  const seen = new Set<string>()
  return values.filter((v) => {
    const key = v.trim().toLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function DetailsStep({ api, editId, onContinue, onManual, onResume }: Props) {
  const { draft, setDetails } = api
  const { details } = draft
  const id = useId()
  const cookies = useCookies()
  const [showErrors, setShowErrors] = useState(false)
  const [priceText, setPriceText] = useState(details.price === null ? '' : String(details.price))

  const errors: DetailErrors = showErrors ? validateDetails(details) : {}

  const history = useMemo(() => [...(cookies ?? [])].sort(byNewest), [cookies])

  const typeSuggestions = useMemo(() => {
    const q = details.cookieType.trim().toLowerCase()
    const all = distinct([...history.map((c) => c.cookieType), ...COMMON_COOKIE_TYPES])
    return all
      .filter((t) => t.toLowerCase() !== q && (!q || t.toLowerCase().includes(q)))
      .slice(0, 8)
  }, [history, details.cookieType])

  const bakerySuggestions = useMemo(() => {
    const q = details.bakery.trim().toLowerCase()
    const seen = new Set<string>()
    return history
      .filter((c) => {
        const key = `${c.bakery.toLowerCase()}|${c.state}`
        if (seen.has(key)) return false
        seen.add(key)
        return c.bakery.toLowerCase() !== q && (!q || c.bakery.toLowerCase().includes(q))
      })
      .slice(0, 6)
  }, [history, details.bakery])

  function submit(next: () => void) {
    if (Object.keys(validateDetails(details)).length > 0) {
      setShowErrors(true)
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      )
      return
    }
    next()
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        submit(onContinue)
      }}
      className="flex flex-1 flex-col"
    >
      <p className="text-xs font-bold tracking-[0.14em] text-crust uppercase">
        {editId ? 'Editing' : 'New rating'}
      </p>
      <h1 className="mt-1 font-display text-[32px] leading-[1.08] font-semibold">
        {editId ? 'Cookie details' : 'What are we rating?'}
      </h1>

      {api.resumed && onResume && (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-texture-soft px-4 py-3 text-sm">
          <History className="size-4 shrink-0 text-texture-ink" />
          <span className="min-w-0 flex-1 font-medium">You have an unfinished rating.</span>
          <button
            type="button"
            onClick={onResume}
            className="font-bold underline underline-offset-2"
          >
            Pick up where I left off
          </button>
          <button
            type="button"
            onClick={api.startOver}
            className="font-semibold text-ink-soft underline underline-offset-2"
          >
            Start over
          </button>
        </div>
      )}

      <div className="mt-5">
        <PhotoPicker photo={draft.photo} editId={editId} onChange={api.setPhoto} />
      </div>

      <div className="mt-6 space-y-5">
        <Field label="Type of cookie" htmlFor={`${id}-type`} error={errors.cookieType}>
          <TextInput
            id={`${id}-type`}
            value={details.cookieType}
            onChange={(e) => setDetails({ cookieType: e.target.value })}
            placeholder="Chocolate chip, snickerdoodle…"
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="next"
            maxLength={80}
            aria-invalid={Boolean(errors.cookieType)}
            aria-describedby={errors.cookieType ? `${id}-type-error` : undefined}
          />
          <Suggestions
            label="Cookie type suggestions"
            items={typeSuggestions.map((t) => ({ key: t, label: t }))}
            onPick={(t) => setDetails({ cookieType: t })}
          />
        </Field>

        <Field label="Bakery" htmlFor={`${id}-bakery`} error={errors.bakery}>
          <TextInput
            id={`${id}-bakery`}
            value={details.bakery}
            onChange={(e) => setDetails({ bakery: e.target.value })}
            placeholder="Where did you buy it?"
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="next"
            maxLength={120}
            aria-invalid={Boolean(errors.bakery)}
            aria-describedby={errors.bakery ? `${id}-bakery-error` : undefined}
          />
          <Suggestions
            label="Bakeries you’ve visited"
            items={bakerySuggestions.map((c) => ({
              key: c.id,
              label: c.city ? `${c.bakery} · ${c.city}` : c.bakery,
            }))}
            onPick={(_, key) => {
              const match = bakerySuggestions.find((c) => c.id === key)
              if (match) setDetails({ bakery: match.bakery, city: match.city, state: match.state })
            }}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="State" htmlFor={`${id}-state`} error={errors.state}>
            <Select
              id={`${id}-state`}
              value={details.state}
              onChange={(e) => setDetails({ state: e.target.value })}
              aria-invalid={Boolean(errors.state)}
              aria-describedby={errors.state ? `${id}-state-error` : undefined}
            >
              <option value="" disabled>
                Choose…
              </option>
              {US_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
              <option value={ELSEWHERE.code}>{ELSEWHERE.name}</option>
            </Select>
          </Field>
          <Field label="City" htmlFor={`${id}-city`} optional>
            <TextInput
              id={`${id}-city`}
              value={details.city}
              onChange={(e) => setDetails({ city: e.target.value })}
              placeholder="Town or city"
              autoComplete="off"
              autoCapitalize="words"
              maxLength={80}
            />
          </Field>
          <Field label="Date" htmlFor={`${id}-date`} error={errors.eatenOn}>
            <TextInput
              id={`${id}-date`}
              type="date"
              value={details.eatenOn}
              max={todayIso()}
              onChange={(e) => setDetails({ eatenOn: e.target.value })}
              aria-invalid={Boolean(errors.eatenOn)}
            />
          </Field>
          <Field label="Price" htmlFor={`${id}-price`} optional error={errors.price}>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-faint">
                $
              </span>
              <TextInput
                id={`${id}-price`}
                inputMode="decimal"
                value={priceText}
                onChange={(e) => {
                  const text = e.target.value.replace(/[^\d.]/g, '')
                  setPriceText(text)
                  const n = Number.parseFloat(text)
                  setDetails({ price: text === '' || Number.isNaN(n) ? null : n })
                }}
                placeholder="0.00"
                className="pl-7"
                autoComplete="off"
                aria-invalid={Boolean(errors.price)}
              />
            </div>
          </Field>
        </div>
      </div>

      <div className="mt-auto pt-8">
        <Button type="submit" size="lg" className="w-full">
          {draft.manual ? 'Continue' : editId ? 'Review the questions' : 'Start tasting'}
          <ArrowRight className="size-5" />
        </Button>
        {!draft.manual && (
          <button
            type="button"
            onClick={() => submit(onManual)}
            className="mx-auto mt-4 flex items-center gap-1.5 text-sm font-semibold text-ink-soft underline-offset-4 hover:text-ink hover:underline"
          >
            <PencilLine className="size-4" />
            Already scored it? Enter the numbers yourself
          </button>
        )}
      </div>
    </form>
  )
}

function Suggestions({
  label,
  items,
  onPick,
}: {
  label: string
  items: { key: string; label: string }[]
  onPick: (label: string, key: string) => void
}) {
  if (items.length === 0) return null
  return (
    <ul aria-label={label} className="no-scrollbar -mx-5 mt-2 flex gap-2 overflow-x-auto px-5 pb-1">
      {items.map((item) => (
        <li key={item.key} className="shrink-0">
          <button
            type="button"
            onClick={() => onPick(item.label, item.key)}
            className="h-9 rounded-full border border-line bg-paper px-3.5 text-sm font-medium text-ink-soft transition hover:border-crust hover:text-ink active:scale-95"
          >
            {item.label}
          </button>
        </li>
      ))}
    </ul>
  )
}
