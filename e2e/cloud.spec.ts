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
