import type { CookieRecord } from '@/lib/db/schema'
import { ANYWHERE, ELSEWHERE, stateName } from '@/lib/states'

/** Today's date in the device's own timezone, as `YYYY-MM-DD`. */
export function todayIso(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Parse `YYYY-MM-DD` as a local date (not UTC, which can shift the day). */
export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

const longDate = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
})
const shortDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const shortDateYear = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})
const monthYear = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })

export function formatDate(iso: string, style: 'long' | 'short' | 'month' = 'long'): string {
  const date = parseIsoDate(iso)
  if (style === 'month') return monthYear.format(date)
  if (style === 'long') return longDate.format(date)
  return date.getFullYear() === new Date().getFullYear()
    ? shortDate.format(date)
    : shortDateYear.format(date)
}

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export function formatPrice(price: number): string {
  return money.format(price)
}

/** "Portland, OR" · "Oregon" · "Outside the U.S." */
export function formatPlace(
  cookie: Pick<CookieRecord, 'city' | 'state'> & { online?: boolean },
): string {
  if (cookie.online) {
    const area =
      cookie.state === ANYWHERE.code
        ? cookie.city
        : formatPlace({ city: cookie.city, state: cookie.state })
    return area ? `Online · ${area}` : 'Online'
  }
  if (cookie.state === ELSEWHERE.code) return cookie.city || ELSEWHERE.name
  if (cookie.state === ANYWHERE.code) return cookie.city || ANYWHERE.name
  return cookie.city ? `${cookie.city}, ${cookie.state}` : stateName(cookie.state)
}

/** An average to one decimal place, the way every list shows it. */
export function formatAverage(n: number): string {
  return n.toFixed(1)
}

/** "a 7.5" but "an 8" and "an 8.5": the article a score takes when read aloud. */
export function aScore(score: string): string {
  return `${/^(8|11|18)/.test(score) ? 'an' : 'a'} ${score}`
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}
