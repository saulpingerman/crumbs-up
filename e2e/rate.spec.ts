import { expect, test } from '@playwright/test'
import { addSamples, answer, categoryScore, fillDetails, withoutCutout } from './helpers'

test('rates a cookie from photo to journal', async ({ page }) => {
  await withoutCutout(page)
  await page.goto('/')
  await page.getByRole('link', { name: 'Rate your first cookie' }).click()

  // The form won't let an unnamed cookie through.
  await page.getByRole('button', { name: 'Start tasting' }).click()
  await expect(page.getByText('What kind of cookie is it?')).toBeVisible()

  await fillDetails(page, {
    type: 'Brown Butter Chocolate Chip',
    bakery: 'Flour & Flame',
    state: 'PA',
    city: 'State College',
    photo: true,
  })
  await page.getByRole('radio', { name: /^Full tasting/ }).click()
  await page.getByRole('button', { name: 'Start tasting' }).click()

  // Look
  await answer(page, 'How did it look sitting in the case?', 'Gorgeous')
  await answer(page, 'How’s the color of the bake?', 'Beautifully browned')
  await answer(page, 'What about its shape and size?', 'Well formed')
  await answer(page, 'Look closely at the surface.', 'Really attractive')
  await answer(page, 'How do the mix-ins or toppings look?', 'Loaded and artful')
  await page.getByRole('button', { name: 'Greasy sheen' }).click()
  await page.getByRole('button', { name: 'Continue with 1 flagged' }).click()

  // (3·8 + 2·8 + 2·6.5 + 2·8 + 2·8) / 11 = 7.73, minus 0.5 for the flaw = 7.23 → 7
  await expect(categoryScore(page, 'Appearance', '7')).toBeVisible()
  await page.getByRole('button', { name: 'Raise appearance by half a point' }).click()
  await expect(categoryScore(page, 'Appearance', '7.5')).toBeVisible()
  await page.getByRole('button', { name: 'Next: texture' }).click()

  // Bite
  await answer(page, 'What style is this cookie going for?', 'Crisp edge, soft center')
  await answer(page, 'How well does it nail “crisp edge, soft center”?', 'Nails it')
  await answer(page, 'How’s the bake all the way through?', 'Spot on')
  await answer(page, 'Does the texture keep things interesting?', 'Lots going on')
  await answer(page, 'How does it feel as you chew?', 'Luxurious')
  await answer(page, 'How fresh does it eat?', 'Very fresh')
  await page.getByRole('button', { name: 'No flaws, carry on' }).click()
  await expect(categoryScore(page, 'Texture', '8')).toBeVisible()
  await page.getByRole('button', { name: 'Next: taste' }).click()

  // Savor
  await answer(page, 'How deep does the flavor go?', 'Layered')
  await answer(page, 'How well balanced is it?', 'Beautifully balanced')
  await answer(page, 'What do the ingredients taste like?', 'Premium')
  await answer(page, 'Does it deliver on what it promised?', 'Bold and true')
  await answer(page, 'When it was gone, how did you feel?', 'Still thinking about it')
  await page.getByRole('button', { name: 'No flaws, carry on' }).click()
  await expect(categoryScore(page, 'Taste', '8')).toBeVisible()
  await page.getByRole('button', { name: 'See the verdict' }).click()

  // (8 + 8 + 7.5) / 3 = 7.83 → 8
  await expect(page.getByRole('img', { name: 'Overall score 8 out of 10' })).toBeVisible()
  await expect(page.getByText('Outstanding')).toBeVisible()
  // A cookie this good gets a few crumbs thrown for it — but no crown, with
  // nothing in the journal yet for it to beat.
  await expect(page.getByTestId('crumbs')).toBeAttached()
  await expect(page.getByTestId('crown')).toHaveCount(0)

  // A score can be revisited from the verdict without redoing the questions.
  await page.getByRole('button', { name: /^Texture 8, adjust/ }).click()
  await page.getByRole('button', { name: 'Raise texture by half a point' }).click()
  await page.getByRole('button', { name: 'Back to the verdict' }).click()
  await expect(page.getByRole('button', { name: /^Texture 8.5, adjust/ })).toBeVisible()
  await page.getByLabel('Tasting notes').fill('Toffee edges and a soft middle.')
  await page.getByRole('button', { name: 'Save to journal' }).click()

  // Saved: the cookie's page shows the scores, the photo and the reasoning.
  await expect(page).toHaveURL(/\/cookie\//)
  await expect(
    page.getByRole('heading', { level: 1, name: 'Brown Butter Chocolate Chip' }),
  ).toBeVisible()
  await expect(page.getByRole('meter', { name: 'Appearance' })).toHaveAttribute(
    'aria-valuenow',
    '7.5',
  )
  await expect(
    page.getByAltText('Brown Butter Chocolate Chip cookie from Flour & Flame'),
  ).toBeVisible()
  await page.getByText('Appearance', { exact: true }).last().click()
  await expect(page.getByText('The questions suggested 7; you moved it up to 7.5.')).toBeVisible()

  // Back lands on the journal, not somewhere inside the finished wizard.
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Cookie journal' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Brown Butter Chocolate Chip/ })).toHaveCount(1)
})

test('keeps an unfinished rating as a draft', async ({ page }) => {
  await page.goto('/rate')
  await fillDetails(page, { type: 'Snickerdoodle', bakery: 'Half Batch', state: 'OH' })
  await page.getByRole('radio', { name: /^Full tasting/ }).click()
  await page.getByRole('button', { name: 'Start tasting' }).click()
  await answer(page, 'How did it look sitting in the case?', 'Inviting')
  await expect(page.getByRole('heading', { name: 'How’s the color of the bake?' })).toBeVisible()

  await page.reload()
  await page.goto('/rate')
  await expect(page.getByText(/You have an unfinished rating: /)).toBeVisible()
  await expect(page.getByLabel('Type of cookie')).toHaveValue('Snickerdoodle')
  await page.getByRole('button', { name: 'Pick up where I left off' }).click()
  await expect(page.getByRole('heading', { name: 'How’s the color of the bake?' })).toBeVisible()
})

test('the back gesture steps through the questions', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Rate your first cookie' }).click()
  await fillDetails(page, { type: 'Sugar', bakery: 'Test Kitchen', state: 'NY' })
  await page.getByRole('radio', { name: /^Full tasting/ }).click()
  await page.getByRole('button', { name: 'Start tasting' }).click()
  await answer(page, 'How did it look sitting in the case?', 'Inviting')
  await expect(page.getByRole('heading', { name: 'How’s the color of the bake?' })).toBeVisible()

  await page.goBack()
  await expect(
    page.getByRole('heading', { name: 'How did it look sitting in the case?' }),
  ).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Inviting' })).toBeChecked()
  // A revisited question can be passed without re-answering it.
  await page.getByRole('button', { name: 'Keep this answer' }).click()
  await expect(page.getByRole('heading', { name: 'How’s the color of the bake?' })).toBeVisible()
  await page.goBack()
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'What are we rating?' })).toBeVisible()
  await page.goBack()
  await expect(
    page.getByRole('heading', { name: 'Every cookie deserves a fair score.' }),
  ).toBeVisible()
})

test('logs a cookie that was already scored, then edits it', async ({ page }) => {
  await page.goto('/rate')
  await fillDetails(page, { type: 'Oatmeal Raisin', bakery: 'Old Notebook Bakery', state: 'VT' })
  await page.getByRole('button', { name: /Already scored it/ }).click()

  await expect(page.getByText('Your scores')).toBeVisible()
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Raise Taste' }).click()
  await page.getByRole('button', { name: 'Lower Appearance' }).click()
  // (7 + 5 + 4.5) / 3 = 5.5
  await expect(page.getByRole('img', { name: 'Overall score 5.5 out of 10' })).toBeVisible()
  await page.getByRole('button', { name: 'Save to journal' }).click()
  await expect(page.getByText('These scores were entered by hand')).toBeVisible()

  await page.getByRole('link', { name: 'Edit' }).click()
  await page.getByRole('button', { name: 'Raise Texture' }).click()
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('meter', { name: 'Texture' })).toHaveAttribute('aria-valuenow', '5.5')
})

test('resuming a draft never skips a flaw check that was not seen', async ({ page }) => {
  await page.goto('/rate')
  await fillDetails(page, { type: 'Sugar', bakery: 'Half Batch', state: 'OH' })
  await page.getByRole('radio', { name: /^Full tasting/ }).click()
  await page.getByRole('button', { name: 'Start tasting' }).click()
  await answer(page, 'How did it look sitting in the case?', 'Inviting')
  await answer(page, 'How’s the color of the bake?', 'Evenly baked')
  await answer(page, 'What about its shape and size?', 'Well formed')
  await answer(page, 'Look closely at the surface.', 'Nice texture')
  await answer(page, 'How do the mix-ins or toppings look?', 'Plain by design')
  await expect(
    page.getByRole('heading', { name: 'Anything off about how it looks?' }),
  ).toBeVisible()

  await page.goto('/rate')
  await page.getByRole('button', { name: 'Pick up where I left off' }).click()
  await expect(
    page.getByRole('heading', { name: 'Anything off about how it looks?' }),
  ).toBeVisible()
})

test('abandoned edits are not brought back later', async ({ page }) => {
  await page.goto('/rate')
  await fillDetails(page, { type: 'Sugar', bakery: 'Second Thoughts', state: 'NY' })
  await page.getByRole('button', { name: /Already scored it/ }).click()
  await page.getByRole('button', { name: 'Save to journal' }).click()
  await expect(page.getByRole('meter', { name: 'Taste' })).toHaveAttribute('aria-valuenow', '5')

  // Start an edit, change something, then walk away with the back gesture.
  await page.getByRole('link', { name: 'Edit' }).click()
  await page.getByRole('button', { name: 'Raise Taste' }).click()
  await expect(page.getByLabel('Taste score')).toHaveText('5.5')
  await page.goBack()
  await expect(page.getByRole('meter', { name: 'Taste' })).toHaveAttribute('aria-valuenow', '5')

  // Editing again starts from the saved cookie, not the abandoned change.
  await page.getByRole('link', { name: 'Edit' }).click()
  await expect(page.getByLabel('Taste score')).toHaveText('5')
})

test('typed-in scores survive a detour through the questions', async ({ page }) => {
  await page.goto('/rate')
  await fillDetails(page, { type: 'Sugar', bakery: 'Either Way', state: 'NY' })
  await page.getByRole('button', { name: /Already scored it/ }).click()
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Raise Taste' }).click()
  await expect(page.getByLabel('Taste score')).toHaveText('8')

  await page.getByRole('button', { name: 'Let the questions score it instead' }).click()
  await expect(page.getByRole('heading', { name: 'How did it look?' })).toBeVisible()
  await page.goBack()
  await page.getByRole('button', { name: /Already scored it/ }).click()
  await expect(page.getByLabel('Taste score')).toHaveText('8')
})

test('a quick review gets from three numbers to a saved cookie', async ({ page }) => {
  await page.goto('/rate')
  await fillDetails(page, { type: 'Peanut Butter', bakery: 'Corner Market', state: 'PA' })
  // A number for each is the default.
  await expect(page.getByRole('radio', { name: /^Quick/ })).toBeChecked()
  await page.getByRole('button', { name: 'Start tasting' }).click()

  // Every number says what it means, and 5 is average.
  await expect(page.getByRole('heading', { name: 'How did it look?' })).toBeVisible()
  await expect(page.getByRole('radio')).toHaveCount(10)
  await expect(
    page.getByRole('radio', { name: /^5 Average: A normal-looking cookie/ }),
  ).toBeVisible()
  await expect(page.getByRole('radio').first()).toHaveAccessibleName(/^10 Perfect/)

  await answer(page, 'How did it look?', /^6 /)
  await answer(page, 'How was the texture?', /^8 /)
  await answer(page, 'How did it taste?', /^8 /)

  // Taste and texture count 40% each, appearance 20%: (8×2 + 8×2 + 6) / 5 = 7.6 → 7.5
  await expect(page.getByRole('img', { name: 'Overall score 7.5 out of 10' })).toBeVisible()
  // One answer only gets close; the steppers land the exact half point.
  await page.getByRole('button', { name: 'Raise Taste' }).click()
  await expect(page.getByLabel('Taste score')).toHaveText('8.5')
  await page.getByRole('button', { name: 'Save to journal' }).click()

  await expect(page).toHaveURL(/\/cookie\//)
  await expect(page.getByText(/A quick review: one number for each/)).toBeVisible()
  await expect(page.getByRole('meter', { name: 'Taste' })).toHaveAttribute('aria-valuenow', '8.5')
  await page.getByText('Taste', { exact: true }).last().click()
  await expect(page.getByText('Your number suggested 8; you moved it up to 8.5.')).toBeVisible()

  // Editing brings it back as a quick review, fine-tuning and all.
  await page.getByRole('link', { name: 'Edit' }).click()
  await expect(page.getByLabel('Taste score')).toHaveText('8.5')
  await page.getByRole('button', { name: 'Lower Taste' }).click()
  await page.getByRole('button', { name: 'Save changes' }).click()
  // Wait for the save to land back on the cookie's page: the verdict has a
  // Taste bar of its own, which would satisfy the next check too early.
  await expect(page.getByText('Changes saved')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'How it earned its scores' })).toBeVisible()
  await expect(page.getByRole('meter', { name: 'Taste' })).toHaveAttribute('aria-valuenow', '8')

  // And the next cookie starts the same way.
  await page.goto('/rate')
  await expect(page.getByRole('radio', { name: /^Quick/ })).toBeChecked()
})

test('a quick review can be traded for the full tasting', async ({ page }) => {
  await page.goto('/rate')
  await fillDetails(page, { type: 'Ginger Molasses', bakery: 'Second Thoughts', state: 'OR' })
  await page.getByRole('button', { name: 'Start tasting' }).click()
  await answer(page, 'How did it look?', /^8 /)
  await answer(page, 'How was the texture?', /^8 /)
  await answer(page, 'How did it taste?', /^8 /)
  await expect(page.getByRole('img', { name: 'Overall score 8 out of 10' })).toBeVisible()

  await page.getByRole('button', { name: /Do the full tasting/ }).click()
  await expect(
    page.getByRole('heading', { name: 'How did it look sitting in the case?' }),
  ).toBeVisible()

  // Back on the details, the choice shows what is now in force, and going
  // back to quick finds the three answers where they were left.
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.getByRole('radio', { name: /^Full tasting/ })).toBeChecked()
  await page.getByRole('radio', { name: /^Quick/ }).click()
  await page.getByRole('button', { name: 'Start tasting' }).click()
  await expect(page.getByRole('radio', { name: /^8 / })).toBeChecked()
})

test('a second tap does not answer the next question unseen', async ({ page }) => {
  await page.goto('/rate')
  await fillDetails(page, { type: 'Sugar', bakery: 'Twice Tapped', state: 'NY' })
  await page.getByRole('radio', { name: /^Full tasting/ }).click()
  await page.getByRole('button', { name: 'Start tasting' }).click()
  await expect(
    page.getByRole('heading', { name: 'How did it look sitting in the case?' }),
  ).toBeVisible()

  const option = page.getByRole('radio', { name: 'Gorgeous' })
  const box = (await option.boundingBox())!
  await option.click()
  // An impatient second tap on the same spot, as the next question slides in.
  await page.waitForTimeout(450)
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)

  const next = page.getByRole('heading', { name: 'How’s the color of the bake?' })
  await expect(next).toBeVisible()
  await page.waitForTimeout(800)
  await expect(next).toBeVisible()
  await expect(page.getByRole('radio', { checked: true })).toHaveCount(0)
})

test('fixing a detail on a saved cookie does not mean redoing the questions', async ({ page }) => {
  await addSamples(page)
  await page.locator('main ul a[href*="/cookie/"]').first().click()
  await page.getByRole('link', { name: 'Edit' }).click()

  // Straight from the verdict to the details, and straight back.
  await page.getByRole('button', { name: 'Edit details' }).click()
  await expect(page.getByRole('heading', { name: 'Cookie details' })).toBeVisible()
  await page.getByLabel('Bakery').fill('Renamed Bakery')
  // A comma is a decimal point to half the world: three-fifty, not 350.
  await page.getByLabel('Price').fill('3,50')
  await expect(page.getByLabel('Price')).toHaveValue('3.50')
  await page.getByRole('button', { name: 'Back to the verdict' }).click()
  await page.getByRole('button', { name: 'Save changes' }).click()

  await expect(page.getByText('Changes saved')).toBeVisible()
  await expect(page.getByText('Renamed Bakery').first()).toBeVisible()
  await expect(page.getByText('$3.50')).toBeVisible()
})

test('a cookie cannot be dated tomorrow', async ({ page }) => {
  await page.goto('/rate')
  await fillDetails(page, { type: 'Sugar', bakery: 'Time Machine', state: 'NY' })
  await page.getByLabel('Date').fill('2999-01-01')
  await page.getByRole('button', { name: 'Start tasting' }).click()
  await expect(page.getByText('Pick a date up to today.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'What are we rating?' })).toBeVisible()
})

test('a cookie that beats the whole journal gets the crown', async ({ page }) => {
  await addSamples(page)
  await page.goto('/rate')
  await fillDetails(page, { type: 'Sea Salt Caramel', bakery: 'Top Shelf', state: 'NY' })
  await page.getByRole('button', { name: /Already scored it/ }).click()

  // Level with the standard, it is nobody's favourite.
  await expect(page.getByRole('img', { name: 'Overall score 5 out of 10' })).toBeVisible()
  await expect(page.getByTestId('crown')).toHaveCount(0)

  for (const category of ['Taste', 'Texture', 'Appearance']) {
    for (let i = 0; i < 10; i++) {
      await page.getByRole('button', { name: `Raise ${category}` }).click()
    }
  }
  await expect(page.getByRole('img', { name: 'Overall score 10 out of 10' })).toBeVisible()
  await expect(page.getByTestId('crown')).toBeVisible()
  await expect(page.getByText('Your new number one')).toBeVisible()
  // Crumbs are for a verdict as it lands, not for a number being typed in.
  await expect(page.getByTestId('crumbs')).toHaveCount(0)
})

test('cookies from the same place are linked, and another is a tap away', async ({ page }) => {
  await page.goto('/rate')
  await fillDetails(page, {
    type: 'Snickerdoodle',
    bakery: 'Two Rivers',
    state: 'PA',
    city: 'Easton',
  })
  await page.getByRole('button', { name: /Already scored it/ }).click()
  await page.getByRole('button', { name: 'Save to journal' }).click()
  await expect(page.getByRole('heading', { name: 'More from Two Rivers' })).toBeVisible()

  // From its page, the next cookie starts at the same place, already linked.
  await page.getByRole('link', { name: 'Rate another cookie from here' }).click()
  await expect(page.getByLabel('Bakery')).toHaveValue('Two Rivers')
  await expect(page.getByLabel('City')).toHaveValue('Easton')
  await expect(page.getByText('Same place as 1 other cookie')).toBeVisible()
  await page.getByLabel('Type of cookie').fill('Molasses')
  await page.getByRole('button', { name: /Already scored it/ }).click()
  await page.getByRole('button', { name: 'Save to journal' }).click()
  await expect(page.getByRole('heading', { name: 'Molasses' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Snickerdoodle/ })).toBeVisible()

  // Starting from scratch, places already in the journal are offered.
  await page.goto('/rate')
  const offered = page.getByRole('list', { name: 'Places you’ve been' })
  await offered.getByRole('button', { name: 'Two Rivers · Easton' }).click()
  await expect(page.getByLabel('Bakery')).toHaveValue('Two Rivers')
  await expect(page.getByText('Same place as 2 other cookies')).toBeVisible()
})
