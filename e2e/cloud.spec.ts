import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { fillDetails, withoutCutout } from './helpers'

/**
 * Accounts and sync, exercised as two devices sharing one account.
 *
 * These need a Supabase to talk to, so they only run when the app was built
 * with one configured:
 *
 *   npx supabase start
 *   npm run test:e2e:cloud
 */
test.skip(!process.env.VITE_SUPABASE_URL, 'no Supabase configured for this run')

const password = 'a-long-test-password'

async function openDevice(browser: Browser): Promise<Page> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await withoutCutout(page)
  return page
}

async function rateByHand(page: Page, type: string, bakery: string, photo = false) {
  await page.goto('/rate')
  await fillDetails(page, { type, bakery, state: 'OR', photo })
  await page.getByRole('button', { name: /Already scored it/ }).click()
  await page.getByRole('button', { name: 'Save to journal' }).click()
  await expect(page.getByText('These scores were entered by hand')).toBeVisible()
}

/**
 * The link in the newest email sent to an address. The local Supabase stack
 * delivers nothing; it keeps every message in an inbox with an API.
 */
async function emailedLink(request: APIRequestContext, email: string): Promise<string> {
  const inbox = process.env.SUPABASE_MAIL_URL
  let link = ''
  await expect(async () => {
    const found = await request.get(`${inbox}/api/v1/search`, { params: { query: `to:${email}` } })
    const { messages } = (await found.json()) as { messages: { ID: string }[] }
    expect(messages.length).toBeGreaterThan(0)
    const message = await request.get(`${inbox}/api/v1/message/${messages[0]!.ID}`)
    const { Text } = (await message.json()) as { Text: string }
    link = /https?:\/\/\S+\/auth\/v1\/verify\S+/.exec(Text)?.[0] ?? ''
    expect(link).not.toBe('')
  }).toPass({ timeout: 15_000 })
  return link
}

/** Fill in the account form and send it; what happens next is up to the caller. */
async function submitAccountForm(page: Page, email: string, how: 'Sign in' | 'Create account') {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: how }).click()
  if (how === 'Sign in') return
  // A project that confirms email addresses (hosted ones do by default)
  // sends a link instead of signing in; follow it like a person would.
  const signedIn = page.getByRole('button', { name: 'Sign out' })
  const askedToConfirm = page.getByText('check your inbox')
  await expect(signedIn.or(askedToConfirm)).toBeVisible({ timeout: 20_000 })
  if (await askedToConfirm.isVisible()) {
    await page.goto(await emailedLink(page.request, email))
    await expect(page.getByText('Signed in', { exact: true })).toBeVisible({ timeout: 20_000 })
    await page.goto('/settings')
  }
}

async function signIn(page: Page, email: string, how: 'Sign in' | 'Create account') {
  await page.goto('/settings')
  await submitAccountForm(page, email, how)
  await expect(page.getByText(email)).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('Everything is synced')).toBeVisible({ timeout: 30_000 })
}

async function syncNow(page: Page) {
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Sync now' }).click()
  await expect(page.getByText('Everything is synced')).toBeVisible({ timeout: 30_000 })
}

test('a journal follows its account from one device to another', async ({ browser }) => {
  const email = `cookie-${crypto.randomUUID()}@example.com`
  const phone = await openDevice(browser)
  const laptop = await openDevice(browser)

  // A cookie rated before there was an account comes along when one is made.
  await rateByHand(phone, 'Chocolate Chip', 'First Bakery', true)
  await signIn(phone, email, 'Create account')

  // A wrong password is turned away; the right one brings the journal, photo and all.
  await laptop.goto('/settings')
  await laptop.getByLabel('Email').fill(email)
  await laptop.getByLabel('Password').fill('not-the-password')
  await laptop.getByRole('button', { name: 'Sign in' }).click()
  await expect(laptop.getByText('That email and password don’t match an account.')).toBeVisible()
  await signIn(laptop, email, 'Sign in')
  await laptop.goto('/')
  await expect(laptop.getByAltText('Chocolate Chip cookie from First Bakery')).toBeVisible({
    timeout: 20_000,
  })

  // New ratings travel the other way.
  await rateByHand(laptop, 'Snickerdoodle', 'Second Bakery')
  await syncNow(laptop)
  await syncNow(phone)
  await phone.goto('/')
  await expect(phone.getByRole('link', { name: /Snickerdoodle/ })).toBeVisible()

  // So do deletions.
  await phone.getByRole('link', { name: /Chocolate Chip/ }).click()
  await phone.getByRole('button', { name: 'Delete' }).click()
  await phone.getByRole('alertdialog').getByRole('button', { name: 'Delete cookie' }).click()
  await expect(phone.getByRole('heading', { name: 'Cookie journal' })).toBeVisible()
  await syncNow(phone)
  await syncNow(laptop)
  await laptop.goto('/')
  await expect(laptop.getByRole('link', { name: /Snickerdoodle/ })).toBeVisible()
  await expect(laptop.getByRole('link', { name: /Chocolate Chip/ })).toHaveCount(0)

  // Signing out can take the journal off the device without touching the account.
  await laptop.goto('/settings')
  await laptop.getByRole('button', { name: 'Sign out' }).click()
  await laptop.getByRole('button', { name: 'Remove it from this device' }).click()
  await expect(laptop.getByRole('button', { name: 'Create account' })).toBeVisible()
  await laptop.goto('/')
  await expect(
    laptop.getByRole('heading', { name: 'Every cookie deserves a fair score.' }),
  ).toBeVisible()
  await phone.goto('/')
  await expect(phone.getByRole('link', { name: /Snickerdoodle/ })).toBeVisible()
})

test('one account cannot see another account’s journal', async ({ browser }) => {
  const ana = await openDevice(browser)
  await rateByHand(ana, 'Lemon', 'Ana’s Secret Spot')
  await signIn(ana, `ana-${crypto.randomUUID()}@example.com`, 'Create account')

  const ben = await openDevice(browser)
  await signIn(ben, `ben-${crypto.randomUUID()}@example.com`, 'Create account')
  await ben.goto('/')
  await expect(
    ben.getByRole('heading', { name: 'Every cookie deserves a fair score.' }),
  ).toBeVisible()
  await expect(ben.getByText('Ana’s Secret Spot')).toHaveCount(0)
})

test('a device refuses to merge one account’s journal into another', async ({ browser }) => {
  const device = await openDevice(browser)
  await rateByHand(device, 'Sugar', 'Shared Tablet Bakery')
  const first = `first-${crypto.randomUUID()}@example.com`
  await signIn(device, first, 'Create account')

  // Sign out but keep the journal, then a different person signs in.
  await device.getByRole('button', { name: 'Sign out' }).click()
  await device.getByRole('button', { name: 'Keep the journal on this device' }).click()
  await expect(device.getByRole('button', { name: 'Create account' })).toBeVisible()

  const second = `second-${crypto.randomUUID()}@example.com`
  await submitAccountForm(device, second, 'Create account')
  await expect(device.getByText('This device holds a different account’s journal')).toBeVisible({
    timeout: 20_000,
  })

  // Choosing to switch loads the second (empty) account; the first is untouched.
  await device.getByRole('button', { name: 'Replace this device’s journal' }).click()
  await expect(device.getByText('Everything is synced')).toBeVisible({ timeout: 30_000 })
  await device.goto('/')
  await expect(
    device.getByRole('heading', { name: 'Every cookie deserves a fair score.' }),
  ).toBeVisible()

  const check = await openDevice(browser)
  await signIn(check, first, 'Sign in')
  await check.goto('/')
  await expect(check.getByText('Shared Tablet Bakery')).toBeVisible()
})

test('a kept journal can be added to a different account on purpose', async ({ browser }) => {
  const device = await openDevice(browser)
  await rateByHand(device, 'Pecan', 'Old Account Bakery')
  await signIn(device, `old-${crypto.randomUUID()}@example.com`, 'Create account')
  await device.getByRole('button', { name: 'Sign out' }).click()
  await device.getByRole('button', { name: 'Keep the journal on this device' }).click()
  await expect(device.getByRole('button', { name: 'Create account' })).toBeVisible()

  const fresh = `new-${crypto.randomUUID()}@example.com`
  await submitAccountForm(device, fresh, 'Create account')
  await device.getByRole('button', { name: 'Add its cookies to this account' }).click()
  await expect(device.getByText('Everything is synced')).toBeVisible({ timeout: 30_000 })

  // The new account now has the cookie, on any device.
  const other = await openDevice(browser)
  await signIn(other, fresh, 'Sign in')
  await other.goto('/')
  await expect(other.getByText('Old Account Bakery')).toBeVisible()
})

test('a forgotten password is reset from the emailed link, in whichever browser opens it', async ({
  browser,
}) => {
  const email = `forgetful-${crypto.randomUUID()}@example.com`
  const phone = await openDevice(browser)
  await rateByHand(phone, 'Oatmeal Raisin', 'Remembered Bakery')
  await signIn(phone, email, 'Create account')
  await phone.getByRole('button', { name: 'Sign out' }).click()
  await phone.getByRole('button', { name: 'Remove it from this device' }).click()

  await phone.getByLabel('Email').fill(email)
  await phone.getByRole('button', { name: 'Forgot password?' }).click()
  await expect(phone.getByText('a reset link is on its way')).toBeVisible()
  const link = await emailedLink(phone.request, email)

  // The email is opened somewhere else entirely — as Mail on a phone would.
  const elsewhere = await openDevice(browser)
  await elsewhere.goto(link)
  await expect(elsewhere.getByText('Choose a new password to finish resetting it.')).toBeVisible({
    timeout: 20_000,
  })
  expect(new URL(elsewhere.url()).pathname).toBe('/settings')
  expect(elsewhere.url()).not.toContain('token')
  await elsewhere.getByLabel('New password').fill('a-brand-new-password')
  await elsewhere.getByRole('button', { name: 'Save new password' }).click()
  await expect(elsewhere.getByText('Password changed')).toBeVisible()
  await expect(elsewhere.getByText(email)).toBeVisible()

  // Back where it started: the old password is dead, the new one brings the journal.
  await phone.getByLabel('Password').fill(password)
  await phone.getByRole('button', { name: 'Sign in' }).click()
  await expect(phone.getByText('That email and password don’t match an account.')).toBeVisible()
  await phone.getByLabel('Password').fill('a-brand-new-password')
  await phone.getByRole('button', { name: 'Sign in' }).click()
  await expect(phone.getByText('Everything is synced')).toBeVisible({ timeout: 30_000 })
  await phone.goto('/')
  await expect(phone.getByText('Remembered Bakery')).toBeVisible()

  // A link only works once; a second try says so instead of doing nothing.
  const later = await openDevice(browser)
  await later.goto(link)
  await expect(later.getByText('That link has expired or was already used')).toBeVisible({
    timeout: 20_000,
  })
  expect(later.url()).not.toContain('error')
})

test('Apple and Google buttons appear when the project has them switched on', async ({
  browser,
}) => {
  const page = await openDevice(browser)
  // The local stack has no providers, so stand in for a project that does.
  await page.route('**/auth/v1/settings', async (route) => {
    const response = await route.fetch()
    const settings = (await response.json()) as { external: Record<string, boolean> }
    await route.fulfill({
      response,
      json: { ...settings, external: { ...settings.external, apple: true, google: true } },
    })
  })
  await page.goto('/settings')
  const buttons = page.getByRole('button', { name: /^Continue with/ })
  await expect(buttons).toHaveText(['Continue with Apple', 'Continue with Google'])

  // Tapping one hands over to that provider, by way of the project, and asks
  // to be sent back to the app afterwards.
  await page.route('**/auth/v1/authorize**', (route) =>
    route.fulfill({ contentType: 'text/html', body: 'Provider sign-in page' }),
  )
  const handover = page.waitForRequest('**/auth/v1/authorize**')
  await page.getByRole('button', { name: 'Continue with Google' }).click()
  const url = new URL((await handover).url())
  expect(url.origin).toBe(new URL(process.env.VITE_SUPABASE_URL!).origin)
  expect(url.searchParams.get('provider')).toBe('google')
  expect(url.searchParams.get('redirect_to')).toBe('http://localhost:4173/')

  // The buttons are remembered, so they are there at once next time — even offline.
  await page.unroute('**/auth/v1/settings')
  await page.route('**/auth/v1/settings', (route) => route.abort())
  await page.goto('/settings')
  await expect(buttons).toHaveCount(2)
})

test('coming back from a sign-in provider signs the device in', async ({ browser }) => {
  const email = `provider-${crypto.randomUUID()}@example.com`
  const first = await openDevice(browser)
  await rateByHand(first, 'Gingersnap', 'Provider Bakery')
  await signIn(first, email, 'Create account')

  // A provider sign-in ends with the project sending the browser back to the
  // app with a session in the address. Get a real session for that account
  // the plain way, and arrive with it exactly as that redirect would.
  const granted = await first.request.post(
    `${process.env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      headers: { apikey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY! },
      data: { email, password },
    },
  )
  const session = (await granted.json()) as { access_token: string; refresh_token: string }
  const arrival = new URLSearchParams({
    access_token: session.access_token,
    expires_in: '3600',
    refresh_token: session.refresh_token,
    token_type: 'bearer',
    provider_token: 'from-the-provider',
  })

  const second = await openDevice(browser)
  await second.goto(`/#${arrival}`)
  await expect(second.getByText('Signed in', { exact: true })).toBeVisible({ timeout: 20_000 })
  expect(second.url()).toBe('http://localhost:4173/')
  await expect(second.getByText('Provider Bakery')).toBeVisible({ timeout: 30_000 })
  await second.goto('/settings')
  await expect(second.getByText(email)).toBeVisible()
})

test('a device is not cleared while it holds cookies the account has not received', async ({
  browser,
}) => {
  const device = await openDevice(browser)
  await signIn(device, `offline-${crypto.randomUUID()}@example.com`, 'Create account')

  // Rated with no connection, so it exists only on this device. (Wait for the
  // app to finish caching itself first, so it can be used offline.)
  await device.evaluate(() => navigator.serviceWorker.ready)
  await expect
    .poll(() => device.evaluate(async () => (await caches.keys()).length), { timeout: 20_000 })
    .toBeGreaterThan(0)
  await device.waitForTimeout(1500)
  await device.context().setOffline(true)
  await rateByHand(device, 'Macaroon', 'Offline Bakery')
  await device.goto('/settings')
  await device.getByRole('button', { name: 'Sign out' }).click()
  await device.getByRole('button', { name: 'Remove it from this device' }).click()
  await expect(device.getByText('Some cookies haven’t reached your account yet')).toBeVisible()
  await device.goto('/')
  await expect(device.getByText('Offline Bakery')).toBeVisible()

  // Back online it is sent first, and then the device can be cleared.
  await device.context().setOffline(false)
  await device.goto('/settings')
  await device.getByRole('button', { name: 'Sign out' }).click()
  await device.getByRole('button', { name: 'Remove it from this device' }).click()
  await expect(device.getByRole('button', { name: 'Create account' })).toBeVisible()
  await device.goto('/')
  await expect(
    device.getByRole('heading', { name: 'Every cookie deserves a fair score.' }),
  ).toBeVisible()
})

test('deleting everything on a signed-out device leaves the account alone', async ({ browser }) => {
  const email = `careful-${crypto.randomUUID()}@example.com`
  const device = await openDevice(browser)
  await rateByHand(device, 'Biscotti', 'Kept Safe Bakery')
  await signIn(device, email, 'Create account')

  // Sign out but keep the journal here, then wipe the device.
  await device.getByRole('button', { name: 'Sign out' }).click()
  await device.getByRole('button', { name: 'Keep the journal on this device' }).click()
  await expect(device.getByRole('button', { name: 'Create account' })).toBeVisible()
  await device.getByRole('button', { name: 'Delete everything' }).click()
  const dialog = device.getByRole('alertdialog')
  await expect(dialog).toContainText('erased from this device')
  await expect(dialog).not.toContainText('from your account')
  await dialog.getByRole('button', { name: 'Delete everything' }).click()
  await expect(device.getByText('Journal deleted')).toBeVisible()

  // Signing back in brings the journal back: nothing was deleted from the account.
  await signIn(device, email, 'Sign in')
  await device.goto('/')
  await expect(device.getByText('Kept Safe Bakery')).toBeVisible()
})

test('a photo that arrives after its cookie replaces the stand-in drawing by itself', async ({
  browser,
}) => {
  const email = `watching-${crypto.randomUUID()}@example.com`
  const phone = await openDevice(browser)
  const laptop = await openDevice(browser)
  await signIn(phone, email, 'Create account')
  await signIn(laptop, email, 'Sign in')
  // The laptop is left sitting on the journal.
  await laptop.goto('/')

  await rateByHand(phone, 'Linzer', 'Late Photo Bakery', true)
  await syncNow(phone)

  // Coming back to the tab is one of the moments the app syncs.
  await laptop.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect(laptop.getByAltText('Linzer cookie from Late Photo Bakery')).toBeVisible({
    timeout: 30_000,
  })
})

test('an account can be deleted from inside the app', async ({ browser }) => {
  const email = `leaving-${crypto.randomUUID()}@example.com`
  const device = await openDevice(browser)
  await rateByHand(device, 'Madeleine', 'Farewell Bakery', true)
  await signIn(device, email, 'Create account')

  // Deleting the account, but keeping what is on this device.
  await device.getByRole('button', { name: 'Delete account…' }).click()
  await expect(device.getByRole('dialog')).toContainText('deleted for good')
  await device
    .getByRole('button', { name: 'Delete account, keep the journal on this device' })
    .click()
  await expect(device.getByText('Account deleted')).toBeVisible({ timeout: 30_000 })
  await expect(device.getByRole('button', { name: 'Create account' })).toBeVisible()
  await device.goto('/')
  await expect(device.getByText('Farewell Bakery')).toBeVisible()

  // The account itself is gone: its password opens nothing.
  await device.goto('/settings')
  await device.getByLabel('Email').fill(email)
  await device.getByLabel('Password').fill(password)
  await device.getByRole('button', { name: 'Sign in' }).click()
  await expect(device.getByText('That email and password don’t match an account.')).toBeVisible()

  // A fresh account takes the journal that was kept; deleting that one and
  // erasing the device leaves nothing anywhere.
  const second = `leaving-too-${crypto.randomUUID()}@example.com`
  await signIn(device, second, 'Create account')
  await device.getByRole('button', { name: 'Delete account…' }).click()
  await device.getByRole('button', { name: 'Delete account and erase this device too' }).click()
  await expect(device.getByText('Account deleted')).toBeVisible({ timeout: 30_000 })
  await device.goto('/')
  await expect(
    device.getByRole('heading', { name: 'Every cookie deserves a fair score.' }),
  ).toBeVisible()
})
