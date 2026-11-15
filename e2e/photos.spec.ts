import { expect, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { answer, fillDetails, withoutCutout } from './helpers'

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))

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
  // It is the same cut-out coming back, not a fresh search (which takes
  // several seconds and could pick something else).
  await page.getByRole('radio', { name: 'Cut-out' }).click()
  await expect(cutout).toBeVisible({ timeout: 2_000 })

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

test('finds the cookie wherever it is, takes correction, and leaves a photo without one alone', async ({
  page,
}) => {
  test.setTimeout(300_000)
  await page.goto('/rate')
  await expect(page.getByRole('heading', { name: 'What are we rating?' })).toBeVisible()

  // The cookie is low and to the left; a napkin sits in the middle of the frame.
  await page.getByTestId('photo-input').setInputFiles(fixture('cookie-off-centre.jpg'))
  const cutout = page.getByAltText('Your cookie, cut out of its photo')
  await expect(cutout).toBeVisible({ timeout: 180_000 })
  // It is the cookie that was cut out: the middle of the picture is golden, not napkin-white.
  const [red, , blue] = await cutout.evaluate((img: HTMLImageElement) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 9
    const context = canvas.getContext('2d')!
    context.drawImage(img, img.naturalWidth * 0.45, img.naturalHeight * 0.45, 9, 9, 0, 0, 9, 9)
    return [...context.getImageData(4, 4, 1, 1).data]
  })
  expect(red! - blue!).toBeGreaterThan(60)

  // "Not the cookie?" shows the whole photo, where a tap says which thing is meant…
  const middleOfCutout = () =>
    cutout.evaluate((img: HTMLImageElement) => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 9
      const context = canvas.getContext('2d')!
      context.drawImage(img, img.naturalWidth * 0.45, img.naturalHeight * 0.45, 9, 9, 0, 0, 9, 9)
      return [...context.getImageData(4, 4, 1, 1).data]
    })
  await page.getByRole('button', { name: 'Not the cookie?' }).click()
  const photo = page.getByTestId('pick-cookie')
  await expect(page.getByText('Tap the cookie, or circle it')).toBeVisible()
  let box = (await photo.boundingBox())!
  expect(box.height).toBeGreaterThan(box.width) // the whole portrait photo, not a crop of it
  await page.mouse.click(box.x + box.width * 0.54, box.y + box.height * 0.46)
  await expect(cutout).toBeVisible({ timeout: 120_000 })
  const napkin = await middleOfCutout()
  expect(napkin[0]! - napkin[2]!).toBeLessThan(20) // the napkin, as asked: white, not golden

  // …and so does a rough circle drawn around it.
  await page.getByRole('button', { name: 'Not the cookie?' }).click()
  await expect(photo).toBeVisible()
  box = (await photo.boundingBox())!
  const centre = { x: box.x + box.width * 0.275, y: box.y + box.height * 0.745 }
  await page.mouse.move(centre.x + box.width * 0.27, centre.y)
  await page.mouse.down()
  for (let step = 1; step <= 26; step++) {
    const angle = (step / 24) * Math.PI * 2
    await page.mouse.move(
      centre.x + box.width * 0.27 * Math.cos(angle),
      centre.y + box.height * 0.2 * Math.sin(angle),
    )
  }
  await page.mouse.up()
  await expect(cutout).toBeVisible({ timeout: 120_000 })
  const circled = await middleOfCutout()
  expect(circled[0]! - circled[2]!).toBeGreaterThan(60)

  // A label on a table: nothing to cut out, so the photo is kept as it was taken.
  await page.getByTestId('photo-input').setInputFiles(fixture('no-cookie.jpg'))
  await expect(page.getByText('Couldn’t pick out the cookie')).toBeVisible({ timeout: 120_000 })
  await expect(page.getByAltText('Your cookie', { exact: true })).toBeVisible()
  await expect(cutout).toHaveCount(0)
  await expect(page.getByRole('radio', { name: 'Original' })).toBeChecked()
})

test('a photo removed by accident can be put back', async ({ page }) => {
  await withoutCutout(page)
  await page.goto('/rate')
  await fillDetails(page, { type: 'Sugar', bakery: 'Butterfingers', state: 'NY', photo: true })
  await page.getByRole('button', { name: 'Remove photo' }).click()
  await expect(page.getByAltText('Your cookie')).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByAltText('Your cookie')).toBeVisible()
})

test('a rating saved before the cut-out arrives still gets it', async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto('/rate')
  await fillDetails(page, {
    type: 'Snickerdoodle',
    bakery: 'In A Hurry',
    state: 'OR',
    photo: true,
  })
  // Three taps and a save: quicker than the cookie finder.
  await page.getByRole('radio', { name: /^Quick/ }).click()
  await page.getByRole('button', { name: 'Start tasting' }).click()
  await answer(page, 'How did it look?', 'Inviting')
  await answer(page, 'How was the texture?', 'Great')
  await answer(page, 'How did it taste?', 'Delicious')
  await page.getByRole('button', { name: 'Save to journal' }).click()

  const photo = page.getByAltText('Snickerdoodle cookie from In A Hurry')
  await expect(photo).toBeVisible()
  // The cut-out is a 1600px square; the photo as it was taken is 800 wide.
  await expect
    .poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth), { timeout: 180_000 })
    .toBe(1600)
})

test('a cookie finder that can’t start says why, for a screenshot to carry back', async ({
  page,
}) => {
  // The model files can't be fetched: as on a network that blocks them.
  await page.route('https://storage.googleapis.com/**', (route) =>
    route.fulfill({ status: 404, body: '' }),
  )
  await page.goto('/rate')
  await page.getByTestId('photo-input').setInputFiles(fixture('cookie.jpg'))
  const photo = page.getByTestId('pick-cookie')
  // The photo takes a tap once its own search has given up, which it does
  // quietly: nobody asked for that one.
  await expect(page.getByText('Tap the cookie, or circle it')).toBeVisible({ timeout: 60_000 })
  const box = (await photo.boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  const toast = page.locator('[data-sonner-toast]').filter({
    hasText: 'The cookie finder couldn’t load',
  })
  await expect(toast).toBeVisible({ timeout: 60_000 })
  await expect(toast).toContainText('Download failed (404)')
})
