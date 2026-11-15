import { expect, test } from '@playwright/test'
import { addSamples, fillDetails, withoutCutout } from './helpers'

test('browses, searches and ranks the journal', async ({ page }) => {
  await addSamples(page)
  const cards = page.locator('main ul a[href*="/cookie/"]')
  await expect(cards).toHaveCount(10)

  await page.getByRole('searchbox', { name: 'Search the journal' }).fill('portland')
  await expect(cards).toHaveCount(2)
  await page.getByRole('searchbox', { name: 'Search the journal' }).fill('')

  // The journal is filtered by town, not by something as big as a state.
  const town = page.getByRole('combobox', { name: 'Filter by town' })
  await town.selectOption({ label: 'Burlington, VT' })
  await expect(cards).toHaveCount(1)
  await town.selectOption({ label: 'Portland, OR' })
  await expect(cards).toHaveCount(2)
  await town.selectOption('')
  await expect(cards).toHaveCount(10)

  await page.getByRole('radio', { name: 'Ranked' }).click()
  await expect(cards.first()).toContainText('#1')
  await expect(cards.first()).toContainText('Brown Butter Chocolate Chip')
})

test('every screen fits a phone without sideways scrolling', async ({ page }) => {
  await addSamples(page)
  for (const [path, landmark] of [
    ['/', 'Cookie journal'],
    ['/map', 'Your places'],
    ['/discover', 'Your palate so far'],
    ['/insights', 'Hall of fame'],
    ['/settings', 'Your journal'],
    ['/guide', 'From answers to a score'],
  ] as const) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: landmark })).toBeVisible()
    // Measured against the layout's own width: on a phone the window's
    // width quietly grows to take in whatever overflows.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow, `${path} overflows`).toBeLessThanOrEqual(0)
  }
})

test('the map opens a state and its cookies', async ({ page }) => {
  // A state's card also looks places up; this test is about the cookies.
  await page.route('https://photon.komoot.io/**', (route) =>
    route.fulfill({ json: { type: 'FeatureCollection', features: [] } }),
  )
  await addSamples(page)
  await page.goto('/map')
  await expect(page.getByText('9 towns')).toBeVisible()
  await page.getByRole('radio', { name: 'States' }).click()
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
  // The street map needs a connection, but the page and the States view don't.
  await page.goto('/map')
  await expect(page.getByRole('heading', { name: 'Your places' })).toBeVisible()
  await page.getByRole('radio', { name: 'States' }).click()
  await expect(page.getByRole('heading', { name: 'State standings' })).toBeVisible()
  await page.goto('/discover')
  await expect(page.getByRole('heading', { name: 'Your palate so far' })).toBeVisible()
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

test('the privacy page says what is kept and where', async ({ page }) => {
  // Reached directly, as the link given to Google and Apple is…
  await page.goto('/privacy')
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible()
  await expect(page.getByText('There are no ads, no tracking')).toBeVisible()
  // …and from inside the app.
  await page.goto('/settings')
  await page.getByRole('link', { name: 'Privacy' }).click()
  await expect(page.getByRole('heading', { name: 'What is kept, and where' })).toBeVisible()
})

test('the scorecard stays out of sight while it is being shared', async ({ page }) => {
  // Stand in for a phone's share sheet, and leave it open.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })
    Object.defineProperty(navigator, 'share', {
      value: () => {
        document.documentElement.dataset.sharing = 'yes'
        return new Promise(() => {})
      },
      configurable: true,
    })
  })
  await addSamples(page)
  await page.locator('main ul a[href*="/cookie/"]').first().click()
  await page.getByRole('button', { name: 'Share scorecard' }).click()
  await expect(page.locator('html[data-sharing]')).toBeAttached({ timeout: 20_000 })

  // The card is built at full size, far wider than a phone. None of it may
  // reach onto the screen.
  const box = await page.getByTestId('share-card').boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x + box!.width).toBeLessThanOrEqual(0)
})

test('the journal is as it was left after a look at a cookie', async ({ page }) => {
  await addSamples(page)
  const cards = page.locator('main ul a[href*="/cookie/"]')
  const search = page.getByRole('searchbox', { name: 'Search the journal' })
  await search.fill('portland')
  await page.getByRole('radio', { name: 'Ranked' }).click()
  await expect(cards).toHaveCount(2)

  await cards.first().click()
  await expect(page).toHaveURL(/\/cookie\//)
  await page.goBack()

  await expect(search).toHaveValue('portland')
  await expect(page.getByRole('radio', { name: 'Ranked' })).toBeChecked()
  await expect(cards).toHaveCount(2)
})

test('the welcome cookie can be nibbled, and the + button asks to be pressed', async ({ page }) => {
  await page.goto('/')
  const cookie = page.locator('[data-bites]')
  await expect(cookie).toHaveAttribute('data-bites', '0')
  // It never stops bobbing, so don't wait for it to hold still.
  await cookie.click({ force: true })
  await expect(cookie).toHaveAttribute('data-bites', '1')
  await expect(page.getByTestId('crumbs')).toBeAttached()
  // Bite by bite it is eaten right across, until only crumbs are left…
  for (let i = 0; i < 4; i++) await cookie.click({ force: true })
  await expect(cookie).toHaveAttribute('data-bites', '5')
  // …and the next tap bakes a fresh one.
  await cookie.click({ force: true })
  await expect(cookie).toHaveAttribute('data-bites', '0')

  // The pulse behind the + button is there to get a first cookie rated, and
  // goes once there is one.
  await expect(page.getByTestId('beckon')).toBeAttached()
  await addSamples(page)
  await expect(page.getByTestId('beckon')).toHaveCount(0)
})

test('a copy of the app without accounts has no Top rated to offer', async ({ page }) => {
  // Top rated adds up everyone's ratings; with no accounts there is no everyone.
  await page.goto('/discover')
  await expect(page.getByRole('heading', { name: 'Discover' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Top rated' })).toHaveCount(0)
  await page.goto('/top')
  await expect(page.getByText('Top rated isn’t switched on yet')).toBeVisible()
  // Nor is there anything to sign in to: the header offers Settings and no more.
  await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sign in' })).toHaveCount(0)
  await page.goto('/account')
  await expect(
    page.getByRole('heading', { name: 'Every cookie deserves a fair score.' }),
  ).toBeVisible()
  expect(new URL(page.url()).pathname).toBe('/')
})

test('a link to the site comes with a picture and a line about it', async ({ page, request }) => {
  await page.goto('/')
  // Messaging apps only follow a full address, and they fetch it from the
  // live site — so check the address, then that this build ships the file.
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    'https://crumbs-up.com/share.jpg',
  )
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /Crumbs Up/)
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', /.{20,}/)

  const picture = await request.get('/share.jpg')
  expect(picture.ok()).toBe(true)
  expect(picture.headers()['content-type']).toContain('image/jpeg')
})
