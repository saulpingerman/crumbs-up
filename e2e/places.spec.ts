import { expect, test, type Page } from '@playwright/test'
import { addSamples, fillDetails } from './helpers'

/** A blank base map, so these tests don't depend on a tile server being up. */
async function fakeTiles(page: Page) {
  await page.route('https://tiles.openfreemap.org/**', (route) => {
    if (route.request().url().includes('/styles/')) {
      return route.fulfill({
        json: {
          version: 8,
          glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
          sources: {},
          layers: [{ id: 'land', type: 'background', paint: { 'background-color': '#e8e6e1' } }],
        },
      })
    }
    return route.fulfill({ status: 204, body: '' })
  })
}

const BAKERY = {
  type: 'Feature',
  properties: {
    osm_type: 'N',
    osm_id: 4242,
    osm_key: 'shop',
    osm_value: 'bakery',
    name: 'Rise & Shine Cookie Co.',
    housenumber: '12',
    street: 'Northwest Flanders Street',
    city: 'Portland',
    state: 'Oregon',
    countrycode: 'US',
  },
  geometry: { type: 'Point', coordinates: [-122.6712, 45.5262] },
}

/** Canned answers from the place-search service. */
async function fakePlaceSearch(page: Page) {
  await page.route('https://photon.komoot.io/**', (route) =>
    route.fulfill({ json: { type: 'FeatureCollection', features: [BAKERY] } }),
  )
}

test('fills in the town from the phone’s location and keeps the exact spot', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 45.5202, longitude: -122.6742 })
  await page.goto('/rate')
  await page.getByRole('button', { name: 'Use my location' }).click()

  await expect(page.getByLabel('City')).toHaveValue('Portland')
  await expect(page.getByLabel('State')).toHaveValue('OR')
  await expect(page.getByText('Exact spot saved for the map.')).toBeVisible()

  // Typing a different town drops the pin: it was for somewhere else.
  await page.getByLabel('City').fill('Sal')
  await expect(page.getByText('Exact spot saved for the map.')).toBeHidden()
  await page.getByRole('button', { name: 'Salem, OR' }).click()
  await expect(page.getByLabel('City')).toHaveValue('Salem')
})

test('suggests towns in any state and sets the state to match', async ({ page }) => {
  await page.goto('/rate')
  await page.getByLabel('City').fill('Ashev')
  await page.getByRole('button', { name: 'Asheville, NC' }).click()
  await expect(page.getByLabel('City')).toHaveValue('Asheville')
  await expect(page.getByLabel('State')).toHaveValue('NC')
})

test('pins a bakery found by name', async ({ page }) => {
  await fakePlaceSearch(page)
  await page.goto('/rate')
  await page.getByLabel('Bakery').fill('Rise & Shine')
  await page.getByRole('button', { name: /Rise & Shine Cookie Co\./ }).click()

  await expect(page.getByLabel('Bakery')).toHaveValue('Rise & Shine Cookie Co.')
  await expect(page.getByLabel('City')).toHaveValue('Portland')
  await expect(page.getByLabel('State')).toHaveValue('OR')
  await expect(page.getByText('Exact spot saved for the map.')).toBeVisible()
})

test('skips online lookups when they are turned off', async ({ page }) => {
  let asked = false
  await page.route('https://photon.komoot.io/**', (route) => {
    asked = true
    return route.fulfill({ json: { type: 'FeatureCollection', features: [BAKERY] } })
  })
  await page.goto('/settings')
  await page.getByRole('switch', { name: 'Look up bakeries online' }).click()
  await page.goto('/rate')
  await page.getByLabel('Bakery').fill('Rise & Shine')
  await page.waitForTimeout(1200)
  expect(asked).toBe(false)
  await expect(page.getByText(/On the map/)).toBeHidden()
})

test('shows the journal’s bakeries on the map and finds new ones nearby', async ({ page }) => {
  await fakeTiles(page)
  await fakePlaceSearch(page)
  await addSamples(page)
  await page.goto('/map')

  // Nine sample bakeries, all placed by their town.
  const map = page.getByRole('application')
  await expect(map).toHaveAttribute('data-ready', 'true', { timeout: 30_000 })
  await expect(map).toHaveAttribute('data-pins', '9')

  // The map's credits stay folded behind their "i" button; the credit that
  // must always be in sight is a small label in the map's corner. There is
  // no paragraph under the map explaining it.
  await expect(page.locator('.maplibregl-ctrl-attrib')).not.toHaveAttribute('open')
  await expect(page.getByRole('link', { name: '© OpenStreetMap' })).toHaveAttribute(
    'href',
    'https://www.openstreetmap.org/copyright',
  )
  await expect(page.getByText(/Gold pins are bakeries/)).toHaveCount(0)

  // Picking one from the list shows its cookies and flies the map there.
  await page.getByRole('button', { name: /Butter & Ember/ }).click()
  await expect(page.getByRole('heading', { name: 'Butter & Ember' })).toBeVisible()
  // The average of the two scores as shown (9 and 7), so it adds up on screen.
  await expect(page.getByText('2 cookies · average 8.0')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open in Maps' })).toHaveAttribute(
    'href',
    /Butter%20%26%20Ember%2C%20Portland%2C%20OR/,
  )

  // Now zoomed in on Portland and sitting still, the map looks for somewhere
  // new by itself: nothing to press.
  await expect(page.getByRole('heading', { name: 'Somewhere new nearby' })).toBeVisible({
    timeout: 15_000,
  })
  await expect(map).toHaveAttribute('data-pins', '10')
  await expect(page.getByText('1 bakery to try here')).toBeVisible()
  await page.getByRole('button', { name: /Rise & Shine Cookie Co\./ }).click()
  await expect(page.getByRole('heading', { name: 'Rise & Shine Cookie Co.' })).toBeVisible()

  // …and go rate it, with its details and exact spot carried over.
  await page.getByRole('link', { name: 'Rate a cookie here' }).click()
  await expect(page.getByLabel('Bakery')).toHaveValue('Rise & Shine Cookie Co.')
  await expect(page.getByLabel('City')).toHaveValue('Portland')
  await expect(page.getByLabel('State')).toHaveValue('OR')
  await expect(page.getByText('Exact spot saved for the map.')).toBeVisible()
})

test('the map asks for nothing when online lookups are turned off', async ({ page }) => {
  let asked = false
  await fakeTiles(page)
  await page.route('https://photon.komoot.io/**', (route) => {
    asked = true
    return route.fulfill({ json: { type: 'FeatureCollection', features: [BAKERY] } })
  })
  await addSamples(page)
  await page.goto('/settings')
  await page.getByRole('switch', { name: 'Look up bakeries online' }).click()
  await page.goto('/map')
  const map = page.getByRole('application')
  await expect(map).toHaveAttribute('data-ready', 'true', { timeout: 30_000 })
  await page.getByRole('button', { name: /Butter & Ember/ }).click()
  await expect(page.getByRole('heading', { name: 'Butter & Ember' })).toBeVisible()
  // Long enough for the map to settle and a search to have gone out, if one were going to.
  await page.waitForTimeout(3000)
  expect(asked).toBe(false)
  await expect(map).toHaveAttribute('data-pins', '9')
})

test('the map shades counties, and any county says where to try', async ({ page }) => {
  await fakePlaceSearch(page)
  await addSamples(page)
  await page.goto('/map')
  await page.getByRole('radio', { name: 'Counties' }).click()

  // It opens on the state with the most cookies: Oregon, with two in Portland.
  await expect(page.getByRole('combobox', { name: 'State' })).toHaveValue('OR')
  await expect(page.getByText('1 of 36 counties')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Multnomah County' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Multnomah County: 2 cookies, average 8.0' }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: /Brown Butter Chocolate Chip/ })).toBeVisible()

  // Under the cookies rated there: a bakery in the county that isn't in the journal.
  await expect(page.getByRole('heading', { name: 'Places to try' })).toBeVisible()
  await expect(page.getByText('Rise & Shine Cookie Co.')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('12 Northwest Flanders Street, Portland')).toBeVisible()

  // A county with nothing rated in it can be tapped too. The bakery found is
  // over the line in Multnomah, so it isn't offered here.
  await page.getByRole('button', { name: 'Washington County: no cookies yet' }).click()
  await expect(page.getByRole('heading', { name: 'Washington County' })).toBeVisible()
  await expect(page.getByText('No cookies yet')).toBeVisible()
  await expect(page.getByText('No bakeries listed here that you haven’t tried.')).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByText('Rise & Shine Cookie Co.')).toHaveCount(0)

  // Back to Multnomah — by keyboard this time; it is a long, thin county and
  // the middle of the box round it is in the county next door — and on to
  // rating a cookie at the bakery.
  await page.getByRole('button', { name: /^Multnomah County/ }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Multnomah County' })).toBeVisible()
  await page.getByRole('link', { name: 'Rate here' }).click()
  await expect(page.getByLabel('Bakery')).toHaveValue('Rise & Shine Cookie Co.')
  await expect(page.getByLabel('City')).toHaveValue('Portland')
  await expect(page.getByLabel('State')).toHaveValue('OR')
})

test('any state can be opened by county, rated in or not', async ({ page }) => {
  await fakePlaceSearch(page)
  await addSamples(page)
  await page.goto('/map')
  await page.getByRole('radio', { name: 'Counties' }).click()
  const state = page.getByRole('combobox', { name: 'State' })

  await state.selectOption({ label: 'Vermont' })
  await expect(page.getByText('1 of 14 counties')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Chittenden County' })).toBeVisible()

  // Nothing rated in Delaware: no county is chosen until one is tapped.
  await state.selectOption({ label: 'Delaware' })
  await expect(page.getByText('0 of 3 counties')).toBeVisible()
  await expect(page.getByText('Tap a county to see where to try there.')).toBeVisible()
  await page.getByRole('button', { name: 'Kent County: no cookies yet' }).click()
  await expect(page.getByRole('heading', { name: 'Kent County' })).toBeVisible()
})

test('a county asks for nothing when online lookups are turned off', async ({ page }) => {
  let asked = false
  await page.route('https://photon.komoot.io/**', (route) => {
    asked = true
    return route.fulfill({ json: { type: 'FeatureCollection', features: [BAKERY] } })
  })
  await addSamples(page)
  await page.goto('/settings')
  await page.getByRole('switch', { name: 'Look up bakeries online' }).click()
  await page.goto('/map')
  await page.getByRole('radio', { name: 'Counties' }).click()
  await expect(page.getByRole('heading', { name: 'Multnomah County' })).toBeVisible()
  await expect(page.getByText('Looking up bakeries is switched off in Settings.')).toBeVisible()
  await page.waitForTimeout(1500)
  expect(asked).toBe(false)
})

test('new territory is towns nearby, and each opens the map there', async ({ page }) => {
  await fakeTiles(page)
  await fakePlaceSearch(page)
  await addSamples(page)
  await page.goto('/discover')
  await expect(page.getByRole('heading', { name: 'New territory' })).toBeVisible()
  await expect(
    page.getByText('Towns near you where you haven’t logged a cookie yet.'),
  ).toBeVisible()

  // A town, how far it is, and from where — not a state that borders another.
  const first = page.getByRole('link', { name: /, [A-Z]{2}.* mi from / }).first()
  await expect(first).toBeVisible()
  await expect(page.getByText(/^borders /)).toHaveCount(0)

  // Following one opens the map on that town, close enough in to be searched
  // straight away rather than asking for a zoom.
  await first.click()
  await expect(page).toHaveURL(/\/map\?lat=-?[\d.]+&lng=-?[\d.]+/)
  const map = page.getByRole('application')
  await expect(map).toHaveAttribute('data-ready', 'true', { timeout: 30_000 })
  await expect(page.getByText(/to try here|No new bakeries here/)).toBeVisible({ timeout: 15_000 })
})

test('recommends what to try next from the journal', async ({ page }) => {
  await page.goto('/discover')
  await expect(page.getByRole('heading', { name: 'Start with the classics' })).toBeVisible()

  await addSamples(page)
  await page.goto('/discover')
  await expect(page.getByRole('heading', { name: 'Your palate so far' })).toBeVisible()
  await expect(page.getByText(/Your best scores go to cookies with/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Worth a return trip' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'New territory' })).toBeVisible()

  // A suggestion starts a rating with the cookie type already filled in.
  const first = page.getByRole('article').first()
  const name = await first.getByRole('heading').innerText()
  await first.getByRole('link', { name: /Found one\? Rate it/ }).click()
  await expect(page.getByLabel('Type of cookie')).toHaveValue(name.replace(/ or .*/, ''))
})

test('a pinned cookie keeps its spot through save and edit', async ({ page, context }) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 44.4759, longitude: -73.2121 })
  await page.goto('/rate')
  await fillDetails(page, { type: 'Sugar', bakery: 'Lakeside Bakes' })
  await page.getByRole('button', { name: 'Use my location' }).click()
  await expect(page.getByLabel('City')).toHaveValue('Burlington')
  await page.getByRole('button', { name: /Already scored it/ }).click()
  await page.getByRole('button', { name: 'Save to journal' }).click()
  await expect(page.getByRole('heading', { name: 'How it earned its scores' })).toBeVisible()

  await page.getByRole('link', { name: 'Edit' }).click()
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.getByText('Exact spot saved for the map.')).toBeVisible()
})
