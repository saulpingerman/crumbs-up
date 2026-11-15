import { createHash } from 'node:crypto'
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
 * The code in the newest email sent to an address — the `nth` one it has been
 * sent, so that a second email isn't mistaken for the first. The local
 * Supabase stack delivers nothing; it keeps every message in an inbox with
 * an API.
 */
async function emailedCode(request: APIRequestContext, email: string, nth = 1): Promise<string> {
  const inbox = process.env.SUPABASE_MAIL_URL
  let code = ''
  await expect(async () => {
    const found = await request.get(`${inbox}/api/v1/search`, { params: { query: `to:${email}` } })
    const { messages } = (await found.json()) as { messages: { ID: string }[] }
    expect(messages.length).toBeGreaterThanOrEqual(nth)
    const message = await request.get(`${inbox}/api/v1/message/${messages[0]!.ID}`)
    const { Text, HTML } = (await message.json()) as { Text: string; HTML: string }
    // Nothing to click: a link is what gets these emails held as phishing.
    expect(`${Text}${HTML}`).not.toMatch(/https?:|href=/i)
    code = /\b\d{6,10}\b/.exec(Text)?.[0] ?? ''
    expect(code).not.toBe('')
  }).toPass({ timeout: 15_000 })
  return code
}

/**
 * From the sign-in page: sign in there, or go through the
 * "Create account" page. What happens once signed in is up to the caller.
 */
async function submitAccountForm(page: Page, email: string, how: 'Sign in' | 'Create account') {
  if (how === 'Sign in') {
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    return
  }
  await page.getByRole('link', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  // A project that confirms email addresses (hosted ones do by default)
  // emails a code instead of signing in; type it in like a person would.
  const signedIn = page.getByRole('button', { name: 'Sign out' })
  const askedForCode = page.getByLabel('Code')
  await expect(signedIn.or(askedForCode)).toBeVisible({ timeout: 20_000 })
  if (await askedForCode.isVisible()) {
    await askedForCode.fill(await emailedCode(page.request, email))
    await page.getByRole('button', { name: 'Confirm' }).click()
  }
  // Either way it ends back on the account page, signed in.
  await expect(signedIn).toBeVisible({ timeout: 20_000 })
  expect(new URL(page.url()).pathname).toBe('/account')
}

async function signIn(page: Page, email: string, how: 'Sign in' | 'Create account') {
  // By way of the button in the header, the way a person gets there.
  await page.goto('/')
  await page.getByRole('link', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await submitAccountForm(page, email, how)
  await expect(page.getByText(email)).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('Everything is synced')).toBeVisible({ timeout: 30_000 })
  // The same button now leads to the account, and says so.
  await expect(page.getByRole('link', { name: 'Account', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toHaveCount(0)
}

async function syncNow(page: Page) {
  await page.goto('/account')
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
  await laptop.goto('/account')
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
  await laptop.goto('/account')
  await laptop.getByRole('button', { name: 'Sign out' }).click()
  await laptop.getByRole('button', { name: 'Remove it from this device' }).click()
  await expect(laptop.getByRole('link', { name: 'Create account' })).toBeVisible()
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
  await expect(device.getByRole('link', { name: 'Create account' })).toBeVisible()

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
  await expect(device.getByRole('link', { name: 'Create account' })).toBeVisible()

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

test('a new account is confirmed with an emailed code, however roundabout the route', async ({
  browser,
}) => {
  const email = `roundabout-${crypto.randomUUID()}@example.com`
  const phone = await openDevice(browser)
  await rateByHand(phone, 'Molasses', 'Patient Bakery')

  // Creating an account has a page to itself. The address already typed
  // into the sign-in form comes along.
  await phone.goto('/account')
  await phone.getByLabel('Email').fill(email)
  await phone.getByRole('link', { name: 'Create account' }).click()
  await expect(phone.getByRole('heading', { name: 'Create account' })).toBeVisible()
  expect(new URL(phone.url()).pathname).toBe('/account/new')
  await expect(phone.getByLabel('Email')).toHaveValue(email)

  // The password is typed twice, and both have to agree.
  const create = phone.getByRole('button', { name: 'Create account' })
  await phone.getByLabel('Password', { exact: true }).fill(password)
  await phone.getByLabel('Confirm password').fill(`${password}-oops`)
  await create.click()
  await expect(phone.getByText('Those passwords don’t match.')).toBeVisible()
  await phone.getByLabel('Password', { exact: true }).fill('short')
  await phone.getByLabel('Confirm password').fill('short')
  await create.click()
  await expect(phone.getByText('Choose a password of at least 8 characters.')).toBeVisible()
  await phone.getByLabel('Password', { exact: true }).fill(password)
  await phone.getByLabel('Confirm password').fill(password)
  await create.click()
  const code = phone.getByLabel('Code')
  await expect(code).toBeVisible({ timeout: 20_000 })
  await expect(phone.getByText(email)).toBeVisible()

  // Off to read the email. Phones throw the page away meanwhile; the step
  // is still there on the way back.
  await phone.reload()
  await expect(code).toBeVisible()

  // A mistyped code says so, and letters don't go in at all.
  const sent = await emailedCode(phone.request, email)
  await code.fill(sent === '000000' ? '111111' : '000000')
  await phone.getByRole('button', { name: 'Confirm' }).click()
  await expect(phone.getByText('That code is wrong or has expired')).toBeVisible()
  await code.fill('12ab34')
  await expect(code).toHaveValue('1234')

  // They give up, come back another day and just try to sign in. The
  // account exists but was never confirmed: a fresh code is sent and asked for.
  await phone.getByRole('button', { name: 'Use a different email' }).click()
  await expect(phone.getByLabel('Confirm password')).toBeVisible()
  // (The service won't email the same person twice within a second — a
  // minute, on the hosted project — and a test is quicker than that.)
  await phone.waitForTimeout(1_100)
  await phone.goto('/account')
  await phone.getByLabel('Email').fill(email)
  await phone.getByLabel('Password').fill(password)
  await phone.getByRole('button', { name: 'Sign in' }).click()
  await expect(code).toBeVisible({ timeout: 20_000 })
  await code.fill(await emailedCode(phone.request, email, 2))
  await phone.getByRole('button', { name: 'Confirm' }).click()
  await expect(phone.getByRole('button', { name: 'Sign out' })).toBeVisible({ timeout: 20_000 })
  expect(new URL(phone.url()).pathname).toBe('/account')
  await expect(phone.getByText('Everything is synced')).toBeVisible({ timeout: 30_000 })

  // Making the same account twice doesn't leave anyone waiting for an email
  // that will never come.
  const other = await openDevice(browser)
  await other.goto('/account/new')
  await other.getByLabel('Email').fill(email)
  await other.getByLabel('Password', { exact: true }).fill('some-other-password')
  await other.getByLabel('Confirm password').fill('some-other-password')
  await other.getByRole('button', { name: 'Create account' }).click()
  await expect(other.getByText('There’s already an account with that email')).toBeVisible()
  await expect(other.getByLabel('Code')).toHaveCount(0)
})

test('a forgotten password is reset on its own page, with an emailed code', async ({ browser }) => {
  const email = `forgetful-${crypto.randomUUID()}@example.com`
  const phone = await openDevice(browser)
  await rateByHand(phone, 'Oatmeal Raisin', 'Remembered Bakery')
  await signIn(phone, email, 'Create account')
  await phone.getByRole('button', { name: 'Sign out' }).click()
  await phone.getByRole('button', { name: 'Remove it from this device' }).click()

  // "Forgot password?" opens a page that asks for the address.
  await phone.getByRole('link', { name: 'Forgot password?' }).click()
  await expect(phone.getByRole('heading', { name: 'Reset password' })).toBeVisible()
  expect(new URL(phone.url()).pathname).toBe('/account/reset')
  await phone.getByRole('button', { name: 'Email me a code' }).click()
  await expect(phone.getByText('Enter your email address.')).toBeVisible()
  await phone.getByLabel('Email').fill(email)
  await phone.getByRole('button', { name: 'Email me a code' }).click()
  await expect(phone.getByText('we emailed it a code')).toBeVisible()
  await phone.getByLabel('Code').fill(await emailedCode(phone.request, email, 2))
  await phone.getByRole('button', { name: 'Continue' }).click()

  // The new password is typed twice too, and the page stays put for it.
  await expect(phone.getByText('Choose a new password to finish resetting it.')).toBeVisible({
    timeout: 20_000,
  })
  expect(new URL(phone.url()).pathname).toBe('/account/reset')
  await phone.getByLabel('New password', { exact: true }).fill('a-brand-new-password')
  await phone.getByLabel('Confirm new password').fill('a-brand-new-passwor')
  await phone.getByRole('button', { name: 'Save new password' }).click()
  await expect(phone.getByText('Those passwords don’t match.')).toBeVisible()
  await phone.getByLabel('Confirm new password').fill('a-brand-new-password')
  await phone.getByRole('button', { name: 'Save new password' }).click()
  await expect(phone.getByText('Password changed')).toBeVisible()
  await expect(phone.getByText(email)).toBeVisible()
  expect(new URL(phone.url()).pathname).toBe('/account')

  // The old password is dead; the new one brings the journal back.
  await phone.getByRole('button', { name: 'Sign out' }).click()
  await phone.getByRole('button', { name: 'Remove it from this device' }).click()
  await phone.getByLabel('Email').fill(email)
  await phone.getByLabel('Password').fill(password)
  await phone.getByRole('button', { name: 'Sign in' }).click()
  await expect(phone.getByText('That email and password don’t match an account.')).toBeVisible()
  await phone.getByLabel('Password').fill('a-brand-new-password')
  await phone.getByRole('button', { name: 'Sign in' }).click()
  await expect(phone.getByText('Everything is synced')).toBeVisible({ timeout: 30_000 })
  await phone.goto('/')
  await expect(phone.getByText('Remembered Bakery')).toBeVisible()

  // Asking for a reset says the same thing whether or not there is an
  // account, so the form can't be used to find out who has one.
  const stranger = await openDevice(browser)
  await stranger.goto('/account/reset')
  await stranger.getByLabel('Email').fill(`nobody-${crypto.randomUUID()}@example.com`)
  await stranger.getByRole('button', { name: 'Email me a code' }).click()
  await expect(stranger.getByText('we emailed it a code')).toBeVisible()
})

test('an emailed link that has expired says so instead of doing nothing', async ({ browser }) => {
  // Emails sent before codes replaced links, and sign-in providers that
  // turn someone away, still come back this way.
  const later = await openDevice(browser)
  await later.goto(
    '/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
  )
  await expect(later.getByText('That link has expired or was already used')).toBeVisible({
    timeout: 20_000,
  })
  expect(later.url()).not.toContain('error')
})

test('Apple and Google buttons appear when the project has them switched on', async ({
  browser,
}) => {
  const page = await openDevice(browser)
  // Google's own sign-in button can't be fetched here — as with a content
  // blocker, or no route to Google — so the app's own button does the job,
  // the long way round. (The test after next covers Google's button itself.)
  await page.route('https://accounts.google.com/**', (route) => route.abort())
  // The local stack has no providers, so stand in for a project that does.
  await page.route('**/auth/v1/settings', async (route) => {
    const response = await route.fetch()
    const settings = (await response.json()) as { external: Record<string, boolean> }
    await route.fulfill({
      response,
      json: { ...settings, external: { ...settings.external, apple: true, google: true } },
    })
  })
  await page.goto('/account')
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
  await page.goto('/account')
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
  await second.goto('/account')
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
  await device.goto('/account')
  await device.getByRole('button', { name: 'Sign out' }).click()
  await device.getByRole('button', { name: 'Remove it from this device' }).click()
  await expect(device.getByText('Some cookies haven’t reached your account yet')).toBeVisible()
  await device.goto('/')
  await expect(device.getByText('Offline Bakery')).toBeVisible()

  // Back online it is sent first, and then the device can be cleared.
  await device.context().setOffline(false)
  await device.goto('/account')
  await device.getByRole('button', { name: 'Sign out' }).click()
  await device.getByRole('button', { name: 'Remove it from this device' }).click()
  await expect(device.getByRole('link', { name: 'Create account' })).toBeVisible()
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
  await expect(device.getByRole('link', { name: 'Create account' })).toBeVisible()
  await device.goto('/settings')
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
  await expect(device.getByRole('link', { name: 'Create account' })).toBeVisible()
  await device.goto('/')
  await expect(device.getByText('Farewell Bakery')).toBeVisible()

  // The account itself is gone: its password opens nothing.
  await device.goto('/account')
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

test('Google’s own sign-in box hands its token to the account service', async ({ page }) => {
  // A stand-in for Google's library: it draws a button, and "signs someone
  // in" when that button is pressed.
  await page.route('https://accounts.google.com/gsi/client', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `
        window.google = { accounts: { id: {
          initialize(options) { window.__google = options },
          renderButton(parent) {
            const button = document.createElement('button')
            button.type = 'button'
            button.textContent = 'Continue with Google'
            button.onclick = () => window.__google.callback({ credential: 'token.from.google' })
            parent.append(button)
          },
          cancel() {},
        } } }`,
    }),
  )
  // The local account service has no Google sign-in switched on; say it has.
  await page.route('**/auth/v1/settings', async (route) => {
    const response = await route.fetch()
    const settings = (await response.json()) as { external: Record<string, boolean> }
    await route.fulfill({
      response,
      json: { ...settings, external: { ...settings.external, google: true } },
    })
  })
  // …and have it turn the token down, which a made-up one deserves.
  let sent: { provider?: string; id_token?: string; nonce?: string } | null = null
  await page.route('**/auth/v1/token?grant_type=id_token', async (route) => {
    sent = route.request().postDataJSON() as typeof sent
    await route.fulfill({
      status: 400,
      json: { error: 'invalid_request', error_description: 'Bad ID token' },
    })
  })

  await page.goto('/account')
  const box = page.getByTestId('google-button')
  await expect(box.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
  const options = await page.evaluate(
    () => (window as unknown as { __google: { client_id: string; nonce: string } }).__google,
  )
  expect(options.client_id).toBe('test-client.apps.googleusercontent.com')

  await box.getByRole('button', { name: 'Continue with Google' }).click()
  await expect.poll(() => sent).not.toBeNull()
  expect(sent).toMatchObject({ provider: 'google', id_token: 'token.from.google' })
  // Google was given the hash of the one-time value; the account service the value itself.
  expect(createHash('sha256').update(sent!.nonce!).digest('hex')).toBe(options.nonce)

  // Turned down, the person is told so, and the app's own button — the long
  // way round, through the account service — takes over.
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(box.getByRole('button')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
})

test('Top rated adds up what people have rated, and anyone can leave it', async ({ browser }) => {
  const email = `cookie-${crypto.randomUUID()}@example.com`
  // A town nobody else has rated in, so this test's cookie is easy to find
  // among whatever else the database holds.
  const tag = crypto.randomUUID().slice(0, 8)
  const town = `Testville ${tag}`
  const rater = await openDevice(browser)
  /** Never signs in. */
  const visitor = await openDevice(browser)

  await rater.goto('/rate')
  await fillDetails(rater, {
    type: 'Ginger Molasses',
    bakery: `Totals ${tag}`,
    state: 'OR',
    city: town,
  })
  await rater.getByRole('button', { name: /Already scored it/ }).click()
  for (let i = 0; i < 4; i++) await rater.getByRole('button', { name: 'Raise Taste' }).click()
  await rater.getByRole('button', { name: 'Save to journal' }).click()
  await expect(rater.getByText('These scores were entered by hand')).toBeVisible()
  await signIn(rater, email, 'Create account')

  // It is one of two halves of Discover, and needs no account to read.
  await visitor.goto('/discover')
  await visitor.getByRole('link', { name: 'Top rated' }).click()
  await expect(visitor.getByRole('heading', { name: 'Top rated' })).toBeVisible()
  await visitor.getByRole('combobox', { name: 'Town' }).selectOption({ label: `${town}, OR` })
  const row = visitor.getByRole('listitem').filter({ hasText: 'Ginger Molasses' })
  await expect(row).toContainText(`Totals ${tag}`)
  await expect(row).toContainText('1 person')
  // Taste 7, texture 5, appearance 5: an average of 5.7.
  await expect(row.getByRole('img', { name: 'Average score 5.7 out of 10' })).toBeVisible()
  await expect(row.getByRole('link', { name: 'Rate it' })).toBeVisible()

  // The same cookie ranked as a bakery and as a kind of cookie.
  await visitor.getByRole('radio', { name: 'Bakeries' }).click()
  await expect(visitor.getByRole('listitem').filter({ hasText: `Totals ${tag}` })).toContainText(
    '1 rating',
  )
  await visitor.getByRole('radio', { name: 'Types' }).click()
  await expect(visitor.getByRole('listitem').filter({ hasText: 'Ginger Molasses' })).toBeVisible()

  // The person who rated it sees their own score against it.
  await rater.goto('/top')
  await rater.getByRole('combobox', { name: 'Town' }).selectOption({ label: `${town}, OR` })
  await expect(rater.getByRole('link', { name: 'You gave it 5.5' })).toBeVisible()

  // They can take their ratings out of the totals…
  await rater.goto('/account')
  const counted = rater.getByRole('switch', { name: 'Count my ratings in Top rated' })
  await expect(counted).toBeChecked()
  await counted.click()
  await expect(counted).not.toBeChecked()

  // …and the next time anyone looks, they are gone.
  await expect(async () => {
    await visitor.goto('/top')
    await expect(visitor.getByRole('heading', { name: 'Top rated' })).toBeVisible()
    await expect(
      visitor.getByRole('combobox', { name: 'Town' }).getByRole('option', { name: `${town}, OR` }),
    ).toHaveCount(0)
  }).toPass({ timeout: 20_000 })

  // The choice is remembered, and can be undone.
  await rater.reload()
  await expect(counted).not.toBeChecked()
  await counted.click()
  await expect(counted).toBeChecked()
})
