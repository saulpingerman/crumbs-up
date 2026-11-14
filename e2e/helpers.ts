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

export async function addSamples(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Look around with sample cookies' }).click()
  await expect(page.getByText('Added 10 sample cookies')).toBeVisible({ timeout: 30_000 })
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
