import {
  ArrowRight,
  History,
  Link2,
  ListChecks,
  LoaderCircle,
  LocateFixed,
  MapPin,
  PencilLine,
} from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/Button'
import { Field, Select, TextInput } from '@/components/Field'
import { Confirm } from '@/components/Sheet'
import { COMMON_COOKIE_TYPES } from '@/lib/cookie-types'
import { plural, todayIso } from '@/lib/format'
import { placeKey, yourPlaces } from '@/lib/bakery-places'
import { findBakery, type OsmPlace } from '@/lib/osm'
import { loadPlaces, normalizePlace, type PlaceIndex } from '@/lib/places'
import { useSettings } from '@/lib/settings'
import { ELSEWHERE, US_STATES } from '@/lib/states'
import { byNewest } from '@/lib/stats'
import { useCookies } from '@/lib/use-cookies'
import { PhotoPicker } from './PhotoPicker'
import { cleanPrice, validateDetails, type DetailErrors } from './steps'
import type { DraftApi } from './useDraft'

interface Props {
  api: DraftApi
  editId: string | null
  onContinue: () => void
  /**
   * Set when Continue goes straight back to the verdict; this is then the
   * way into the questions instead.
   */
  onQuestions?: () => void
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

export function DetailsStep({ api, editId, onContinue, onQuestions, onManual, onResume }: Props) {
  const { draft, setDetails } = api
  const { details } = draft
  const id = useId()
  const cookies = useCookies()
  const [showErrors, setShowErrors] = useState(false)
  const [priceText, setPriceText] = useState(details.price === null ? '' : String(details.price))

  const [confirmStartOver, setConfirmStartOver] = useState(false)

  const errors: DetailErrors = showErrors ? validateDetails(details) : {}

  // Name the draft that was picked up, so it is obvious when it isn't the
  // cookie someone just asked to rate.
  const unfinishedCookie = [details.cookieType.trim(), details.bakery.trim()]
    .filter(Boolean)
    .join(' from ')
  const unfinished = unfinishedCookie
    ? `You have an unfinished rating: ${unfinishedCookie}.`
    : 'You have an unfinished rating.'

  const history = useMemo(() => [...(cookies ?? [])].sort(byNewest), [cookies])

  const typeSuggestions = useMemo(() => {
    const q = details.cookieType.trim().toLowerCase()
    const all = distinct([...history.map((c) => c.cookieType), ...COMMON_COOKIE_TYPES])
    return all
      .filter((t) => t.toLowerCase() !== q && (!q || t.toLowerCase().includes(q)))
      .slice(0, 8)
  }, [history, details.cookieType])

  // Places already in the journal. Picking one links this cookie to the
  // others from there: same bakery, town and map pin.
  const journalPlaces = useMemo(() => yourPlaces(cookies ?? []), [cookies])
  const editing = editId ? (cookies ?? []).find((c) => c.id === editId) : undefined
  const linkedPlace = journalPlaces.find(
    (p) =>
      p.key === placeKey(details) &&
      // A cookie being edited is only "linked" if others share its place.
      p.cookies - (editing && placeKey(editing) === p.key ? 1 : 0) > 0,
  )
  const bakerySuggestions = useMemo(() => {
    const q = details.bakery.trim().toLowerCase()
    return journalPlaces
      .filter((p) => p.key !== placeKey(details) && (!q || p.bakery.toLowerCase().includes(q)))
      .slice(0, 8)
  }, [journalPlaces, details])

  // The town list is only fetched once someone goes near the city field.
  const [places, setPlaces] = useState<PlaceIndex | null>(null)
  const wantPlaces = () => {
    if (!places) void loadPlaces().then(setPlaces, () => {})
  }
  const citySuggestions = useMemo(() => {
    if (!places) return []
    const typed = normalizePlace(details.city)
    return places
      .search(details.city, details.state || undefined, 5)
      .filter((p) => !(normalizePlace(p.name) === typed && p.state === details.state))
  }, [places, details.city, details.state])

  // Look the bakery up on the map as its name is typed, to offer an exact pin.
  const { onlinePlaces } = useSettings()
  const typedBakery = details.bakery.trim()
  const [lookup, setLookup] = useState<{ query: string; matches: OsmPlace[] } | null>(null)
  // Lookups are steered towards the town that was typed — never towards the
  // phone's own position, which stays on the device.
  const town = places?.find(details.city, details.state)
  const nearLat = town?.lat
  const nearLng = town?.lng
  const pinned = Boolean(details.place)
  useEffect(() => {
    // With the exact spot already known there is nothing to look up.
    if (pinned || !onlinePlaces || typedBakery.length < 3 || !navigator.onLine) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      const near =
        nearLat !== undefined && nearLng !== undefined ? { lat: nearLat, lng: nearLng } : null
      findBakery(typedBakery, near, controller.signal).then(
        (matches) => setLookup({ query: typedBakery, matches }),
        // Offline or rate-limited: the form works fine without suggestions.
        () => {},
      )
    }, 450)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [pinned, onlinePlaces, typedBakery, nearLat, nearLng])
  const mapMatches =
    lookup?.query === typedBakery && !details.place
      ? lookup.matches
          .filter((m) => !details.state || !m.state || m.state === details.state)
          .slice(0, 4)
      : []

  const [locating, setLocating] = useState(false)
  /** Fill in the town from the phone's location, and keep the exact spot. */
  async function locate() {
    if (!('geolocation' in navigator)) {
      toast.error('This browser can’t share its location', {
        description: 'Type the city instead.',
      })
      return
    }
    setLocating(true)
    try {
      const [index, position] = await Promise.all([
        loadPlaces(),
        new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 12_000,
            maximumAge: 60_000,
          }),
        ),
      ])
      setPlaces(index)
      const here = {
        lat: Math.round(position.coords.latitude * 1e5) / 1e5,
        lng: Math.round(position.coords.longitude * 1e5) / 1e5,
      }
      const town = index.nearest(here)
      if (!town) {
        toast('Couldn’t match that to a U.S. town', { description: 'Type the city instead.' })
        return
      }
      setDetails({ city: town.name, state: town.state, place: here })
      toast.success(`Pinned in ${town.name}, ${town.state}`)
    } catch (error) {
      const denied =
        typeof GeolocationPositionError !== 'undefined' &&
        error instanceof GeolocationPositionError &&
        error.code === error.PERMISSION_DENIED
      toast.error(
        denied ? 'Location is switched off for this site' : 'Couldn’t get your location',
        {
          description: denied
            ? 'Allow location for Crumbs Up in your browser settings, or type the city.'
            : 'Type the city instead.',
        },
      )
    } finally {
      setLocating(false)
    }
  }

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
      onKeyDown={(e) => {
        // The phone keyboard's "next" key is Enter. In a text field it should
        // move on to the next field, not submit a half-filled form.
        if (e.key !== 'Enter' || !(e.target instanceof HTMLInputElement)) return
        e.preventDefault()
        const fields = [
          ...e.currentTarget.querySelectorAll<HTMLElement>('input:not([type=file]), select'),
        ]
        const next = fields[fields.indexOf(e.target) + 1]
        if (next) next.focus()
        else e.target.blur()
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
        <div className="mt-4 rounded-2xl bg-texture-soft px-4 py-3 text-sm">
          <p className="flex items-start gap-2 font-medium [overflow-wrap:anywhere]">
            <History className="mt-0.5 size-4 shrink-0 text-texture-ink" />
            {unfinished}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2 pl-6">
            <Button type="button" size="sm" className="h-11" onClick={onResume}>
              Pick up where I left off
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-11"
              onClick={() => setConfirmStartOver(true)}
            >
              Start over
            </Button>
          </div>
        </div>
      )}
      <Confirm
        open={confirmStartOver}
        onOpenChange={setConfirmStartOver}
        title="Start over?"
        description="This clears the unfinished rating: its details, photo and answers."
        confirmLabel="Start over"
        cancelLabel="Keep it"
        destructive
        onConfirm={api.startOver}
      />

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
          {linkedPlace ? (
            <p className="mt-2 flex items-center gap-1.5 text-[13px] font-medium text-ok">
              <Link2 className="size-4 shrink-0" aria-hidden />
              Same place as{' '}
              {plural(
                linkedPlace.cookies - (editing && placeKey(editing) === linkedPlace.key ? 1 : 0),
                'other cookie',
              )}
            </p>
          ) : (
            <Suggestions
              label="Places you’ve been"
              items={bakerySuggestions.map((p) => ({
                key: p.key,
                label: p.city ? `${p.bakery} · ${p.city}` : p.bakery,
              }))}
              onPick={(_, key) => {
                const match = bakerySuggestions.find((p) => p.key === key)
                if (match) {
                  setDetails({
                    bakery: match.bakery,
                    city: match.city,
                    state: match.state,
                    place: match.place,
                  })
                }
              }}
            />
          )}
          {mapMatches.length > 0 && (
            <div className="mt-2 rounded-2xl border border-line bg-paper p-1.5">
              <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-bold tracking-[0.1em] text-ink-faint uppercase">
                Pick one to pin it on the map
              </p>
              <ul aria-label="Matching places on the map">
                {mapMatches.map((match) => (
                  <li key={match.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setDetails({
                          bakery: match.name,
                          city: match.city || details.city,
                          state: match.state || details.state,
                          place: { lat: match.lat, lng: match.lng },
                        })
                      }
                      className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-oat active:scale-[0.99]"
                    >
                      <MapPin className="size-4 shrink-0 text-crust" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold">
                          {match.name}
                        </span>
                        <span className="block truncate text-[13px] text-ink-soft">
                          {[match.street, match.city, match.state].filter(Boolean).join(', ')}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Field>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <label htmlFor={`${id}-city`} className="text-sm font-semibold">
              City <span className="ml-1 text-xs font-medium text-ink-faint">Optional</span>
            </label>
            <button
              type="button"
              onClick={() => void locate()}
              disabled={locating}
              className="flex items-center gap-1.5 text-sm font-semibold text-crust underline-offset-4 hover:underline disabled:opacity-60"
            >
              {locating ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <LocateFixed className="size-4" />
              )}
              Use my location
            </button>
          </div>
          <TextInput
            id={`${id}-city`}
            value={details.city}
            onFocus={wantPlaces}
            onChange={(e) => {
              wantPlaces()
              // A typed city replaces any pinned spot: the pin was somewhere else.
              setDetails({ city: e.target.value, place: null })
            }}
            placeholder="Town or city"
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="next"
            maxLength={80}
          />
          <Suggestions
            label="Matching towns"
            items={citySuggestions.map((p) => ({
              key: `${p.name}|${p.state}`,
              label: `${p.name}, ${p.state}`,
            }))}
            onPick={(_, key) => {
              const match = citySuggestions.find((p) => `${p.name}|${p.state}` === key)
              if (match) setDetails({ city: match.name, state: match.state, place: null })
            }}
          />
          {details.place && (
            <p className="mt-2 flex items-center gap-1.5 text-[13px] text-ink-soft">
              <MapPin className="size-4 shrink-0 text-crust" aria-hidden />
              Exact spot saved for the map.
              <button
                type="button"
                onClick={() => setDetails({ place: null })}
                className="font-semibold underline underline-offset-2"
              >
                Remove
              </button>
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="State" htmlFor={`${id}-state`} error={errors.state}>
            <Select
              id={`${id}-state`}
              value={details.state}
              onChange={(e) => setDetails({ state: e.target.value, place: null })}
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
                  const text = cleanPrice(e.target.value)
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
          {onQuestions
            ? 'Back to the verdict'
            : draft.manual
              ? 'Continue'
              : editId
                ? 'Review the numbers'
                : 'Start rating'}
          <ArrowRight className="size-5" />
        </Button>
        {onQuestions && !draft.manual && (
          <button
            type="button"
            onClick={() => submit(onQuestions)}
            className="mx-auto mt-4 flex min-h-11 items-center gap-1.5 text-sm font-semibold text-ink-soft underline-offset-4 hover:text-ink hover:underline"
          >
            <ListChecks className="size-4" />
            Pick the numbers again
          </button>
        )}
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

/** One of the two ways to rate: a big, fully-worded radio button. */
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
