import { expect, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'

export const COOKIE_PHOTO = fileURLToPath(new URL('./fixtures/cookie.jpg', import.meta.url))

/** Fill in the first wizard screen. */
export async function fillDetails(
  page: Page,
  details: { type: string; bakery: string; state?: string; city?: string; photo?: boolean },
) {
  await expect(page.getByRole('heading', { name: 'What are we rating?' })).toBeVisible()
  if (details.photo) {
    await page.getByTestId('photo-input').setInputFiles(COOKIE_PHOTO)
    await expect(page.getByAltText('Your cookie')).toBeVisible()
  }
  await page.getByLabel('Type of cookie').fill(details.type)
  await page.getByLabel('Bakery').fill(details.bakery)
  if (details.state) await page.getByLabel('State').selectOption(details.state)
  if (details.city) await page.getByLabel('City').fill(details.city)
}

/** Answer the question on screen; the wizard moves on by itself. */
export async function answer(page: Page, prompt: string | RegExp, choice: string) {
  await expect(page.getByRole('heading', { level: 1, name: prompt })).toBeVisible()
  await page.getByRole('radio', { name: choice }).click()
}

/**
 * Fill the journal with the ten sample cookies. The app has no button for
 * this; test builds leave a hook on the page for it (see src/main.tsx).
 */
export async function addSamples(page: Page) {
  await page.goto('/')
  await expect(page.getByText('Welcome to Crumbs Up')).toBeVisible()
  const added = await page.evaluate(() =>
    (window as unknown as { crumbsUpSamples: () => Promise<number> }).crumbsUpSamples(),
  )
  expect(added).toBe(10)
  await expect(page.getByRole('heading', { name: 'Cookie journal' })).toBeVisible()
}

/** The big animated number on a category result screen. */
export function categoryScore(
  page: Page,
  category: 'Appearance' | 'Texture' | 'Taste',
  score: string,
) {
  return page.getByLabel(`${category}: ${score} out of 10`)
}

/**
 * Turn the automatic photo cut-out off for a test that isn't about it, so it
 * doesn't download the model or change the picture halfway through.
 */
export async function withoutCutout(page: Page) {
  await page.addInitScript(() => {
    const key = 'crumbs-up:settings'
    const settings = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>
    localStorage.setItem(key, JSON.stringify({ ...settings, autoCutout: false }))
  })
}
