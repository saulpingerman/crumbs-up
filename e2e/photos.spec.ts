import { expect, test } from '@playwright/test'
import { fillDetails } from './helpers'

test('a cookie without a photo gets an illustration drawn from its review', async ({ page }) => {
  await page.goto('/rate')
  await fillDetails(page, { type: 'Oatmeal Raisin', bakery: 'No Camera Bakery', state: 'VT' })
  await page.getByRole('button', { name: /Already scored it/ }).click()
  await page.getByRole('button', { name: 'Save to journal' }).click()

  await expect(page.getByAltText('Illustration of a Oatmeal Raisin cookie')).toBeVisible()
  await expect(page.getByText('Illustration', { exact: true })).toBeVisible()

  await page.goto('/')
  const card = page.getByRole('link', { name: /Oatmeal Raisin/ })
  await expect(card.getByAltText('Illustration of a Oatmeal Raisin cookie')).toBeVisible()
})

test('cuts the cookie out of its photo and keeps the original', async ({ page }) => {
  // The first run downloads the cookie-finding model, so allow for that.
  test.setTimeout(240_000)
  await page.goto('/rate')
  await fillDetails(page, {
    type: 'Chocolate Chip',
    bakery: 'Lift-Off Bakery',
    state: 'OR',
    photo: true,
  })

  // The cut-out replaces the snapshot by itself…
  const cutout = page.getByAltText('Your cookie, cut out of its photo')
  await expect(cutout).toBeVisible({ timeout: 180_000 })
  await expect(page.getByRole('radio', { name: 'Cut-out' })).toBeChecked()

  // …and it is square: the cookie set on a tabletop, not the photo cropped.
  const size = await cutout.evaluate((img: HTMLImageElement) => [
    img.naturalWidth,
    img.naturalHeight,
  ])
  expect(size).toEqual([1600, 1600])

  // The untouched photo is one tap away, and so is the cut-out again.
  await page.getByRole('radio', { name: 'Original' }).click()
  const original = page.getByAltText('Your cookie', { exact: true })
  await expect(original).toBeVisible()
  expect(await original.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(800)
  await page.getByRole('radio', { name: 'Cut-out' }).click()
  await expect(cutout).toBeVisible({ timeout: 60_000 })

  await page.getByRole('button', { name: /Already scored it/ }).click()
  await page.getByRole('button', { name: 'Save to journal' }).click()
  await expect(page.getByAltText('Chocolate Chip cookie from Lift-Off Bakery')).toBeVisible()

  // Editing later still knows it is a cut-out and can go back to the photo.
  await page.getByRole('link', { name: 'Edit' }).click()
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.getByRole('radio', { name: 'Cut-out' })).toBeChecked()
  await page.getByRole('radio', { name: 'Original' }).click()
  await expect(page.getByRole('radio', { name: 'Original' })).toBeChecked()
  expect(
    await page
      .getByAltText('Your cookie', { exact: true })
      .evaluate((img: HTMLImageElement) => img.naturalWidth),
  ).toBe(800)
})
