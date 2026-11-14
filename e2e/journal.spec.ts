import { expect, test } from '@playwright/test'
import { addSamples, fillDetails, withoutCutout } from './helpers'

test('browses, searches and ranks the journal', async ({ page }) => {
  await addSamples(page)
  const cards = page.locator('main ul a[href*="/cookie/"]')
  await expect(cards).toHaveCount(10)

  await page.getByRole('searchbox', { name: 'Search the journal' }).fill('portland')
  await expect(cards).toHaveCount(2)
  await page.getByRole('searchbox', { name: 'Search the journal' }).fill('')

  await page.getByRole('combobox', { name: 'Filter by state' }).selectOption('VT')
  await expect(cards).toHaveCount(1)
  await page.getByRole('combobox', { name: 'Filter by state' }).selectOption('')

  await page.getByRole('radio', { name: 'Ranked' }).click()
  await expect(cards.first()).toContainText('#1')
  await expect(cards.first()).toContainText('Brown Butter Chocolate Chip')
})

test('every screen fits a phone without sideways scrolling', async ({ page }) => {
  await addSamples(page)
  for (const [path, landmark] of [
    ['/', 'Cookie journal'],
    ['/map', 'State standings'],
    ['/insights', 'Hall of fame'],
    ['/settings', 'Your journal'],
    ['/guide', 'From answers to a score'],
  ] as const) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: landmark })).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow, `${path} overflows`).toBeLessThanOrEqual(0)
  }
})

test('the map opens a state and its cookies', async ({ page }) => {
  await addSamples(page)
  await page.goto('/map')
  await expect(page.getByText('9 of 51')).toBeVisible()
  await page
    .getByRole('button', { name: /Oregon/ })
    .last()
    .click()
  await expect(page.getByRole('heading', { name: 'Oregon' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Peanut Butter/ })).toBeVisible()
})

test('changing the weighting re-scores the journal', async ({ page }) => {
  await addSamples(page)
  // Birthday Cake: taste 3.5, texture 5.5, appearance 8.5.
  const card = page.getByRole('link', { name: /Birthday Cake/ })
  await expect(card.getByRole('img', { name: /Overall score/ })).toHaveAccessibleName(
    'Overall score 6 out of 10',
  )
  await page.goto('/settings')
  await page.getByRole('radio', { name: /Taste first/ }).click()
  await page.goto('/')
  // 0.5·3.5 + 0.3·5.5 + 0.2·8.5 = 5.1 → 5
  await expect(card.getByRole('img', { name: /Overall score/ })).toHaveAccessibleName(
    'Overall score 5 out of 10',
  )
})

test('backs up, wipes and restores the journal', async ({ page }) => {
  await withoutCutout(page)
  await page.goto('/rate')
  await fillDetails(page, { type: 'Sugar', bakery: 'Round Trip Bakery', state: 'NY', photo: true })
  await page.getByRole('button', { name: /Already scored it/ }).click()
  await page.getByRole('button', { name: 'Save to journal' }).click()
  await expect(page.getByText('These scores were entered by hand')).toBeVisible()

  await page.goto('/settings')
  await expect(page.getByText('1 cookie saved on this device')).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Back up journal' }).click()
  const backup = await (await download).path()
  await expect(page.getByText('Everything is backed up.')).toBeVisible()

  await page.getByRole('button', { name: 'Delete everything' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete everything' }).click()
  await expect(page.getByText('0 cookies saved on this device')).toBeVisible()

  await page.getByTestId('restore-input').setInputFiles(backup)
  await expect(page.getByText('1 cookie saved on this device')).toBeVisible()
  await page.goto('/')
  await expect(page.getByAltText('Sugar cookie from Round Trip Bakery')).toBeVisible()
})

test('works with no connection once it has been opened', async ({ page, context }) => {
  await addSamples(page)
  await page.evaluate(() => navigator.serviceWorker.ready)
  // Give the service worker a moment to finish caching the app.
  await expect
    .poll(() => page.evaluate(async () => (await caches.keys()).length), { timeout: 20_000 })
    .toBeGreaterThan(0)
  await page.waitForTimeout(1500)

  await context.setOffline(true)
  await page.goto('/insights')
  await expect(page.getByRole('heading', { name: 'Hall of fame' })).toBeVisible()
  await page.goto('/map')
  await expect(page.getByRole('heading', { name: 'State standings' })).toBeVisible()
})

test('coming back from a cookie returns to the same place in the journal', async ({ page }) => {
  await addSamples(page)
  const last = page.locator('main ul a[href*="/cookie/"]').last()
  await last.scrollIntoViewIfNeeded()
  const before = await page.evaluate(() => window.scrollY)
  expect(before).toBeGreaterThan(200)

  await last.click()
  await expect(page.getByRole('heading', { name: 'How it earned its scores' })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Cookie journal' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before - 60)
})
