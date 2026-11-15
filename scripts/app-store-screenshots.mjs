// The App Store screenshots: the app with its sample cookies, at the size
// Apple requires (iPhone with Dynamic Island, medium display: 1206 × 2622),
// saved to docs/app-store/.
//
//   node scripts/app-store-screenshots.mjs
//
// Needs Playwright's Chromium (`npx playwright install chromium`).
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'

const root = new URL('..', import.meta.url).pathname
const out = join(root, 'docs/app-store')
const build = mkdtempSync(join(tmpdir(), 'crumbs-up-shots-'))
const port = 4175
const site = `http://localhost:${port}`

// The test build has the sample cookies to hand.
const built = spawnSync('npx', ['vite', 'build', '--outDir', build], {
  cwd: root,
  env: { ...process.env, VITE_E2E: '1' },
  stdio: 'inherit',
})
if (built.status !== 0) process.exit(built.status ?? 1)
const server = spawn(
  'npx',
  ['vite', 'preview', '--port', String(port), '--strictPort', '--outDir', build],
  { cwd: root, stdio: 'ignore' },
)

try {
  for (let i = 0; i < 50; i++) {
    if (
      await fetch(site).then(
        (r) => r.ok,
        () => false,
      )
    )
      break
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  mkdirSync(out, { recursive: true })
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 402, height: 874 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  })
  // No bakery lookups: the shots shouldn't depend on someone else's server.
  await context.route('https://photon.komoot.io/**', (route) =>
    route.fulfill({ json: { type: 'FeatureCollection', features: [] } }),
  )
  const page = await context.newPage()
  const shot = async (name) => {
    await page.waitForTimeout(900)
    await page.screenshot({ path: join(out, name), type: 'jpeg', quality: 90 })
    console.log(`› ${name}`)
  }

  await page.goto(site)
  await page.waitForFunction(() => 'crumbsUpSamples' in window)
  await page.evaluate(() => window.crumbsUpSamples())
  await page.goto(site)
  await page.getByRole('heading', { name: 'Cookie journal' }).waitFor()
  await shot('1-journal.jpg')

  await page.goto(`${site}/rate`)
  await page.getByLabel('Type of cookie').fill('Salted Caramel Chocolate Chip')
  await page.getByLabel('Bakery').fill('Hearth & Honey')
  await page.getByLabel('City').fill('Portland')
  await page.getByLabel('State').selectOption('OR')
  await page.getByRole('button', { name: 'Start rating' }).click()
  await page.getByRole('heading', { name: 'How did it look?' }).waitFor()
  await page.getByRole('radio', { name: /^8 / }).click()
  await page.getByRole('heading', { name: 'How was the texture?' }).waitFor()
  await page.waitForTimeout(500)
  await page.getByRole('radio', { name: /^9 / }).click()
  await page.getByRole('heading', { name: 'How did it taste?' }).waitFor()
  await shot('2-numbers.jpg')
  await page.waitForTimeout(500)
  await page.getByRole('radio', { name: /^9 / }).click()
  await page.getByRole('img', { name: /Overall score/ }).waitFor()
  await page.waitForTimeout(1600)
  await shot('3-verdict.jpg')

  await page.goto(site)
  await page
    .getByRole('link', { name: /Brown Butter Chocolate Chip/ })
    .first()
    .click()
  await page.getByRole('heading', { name: 'How it earned its scores' }).waitFor()
  // The "Sample" tag means nothing to someone browsing the store.
  await page.getByText('Sample', { exact: true }).evaluate((tag) => tag.remove())
  await shot('4-cookie.jpg')

  await page.goto(`${site}/map`)
  await page.getByRole('radio', { name: 'Counties' }).click()
  await page.getByRole('group', { name: /by county/ }).waitFor()
  await shot('5-map.jpg')

  await page.goto(`${site}/insights`)
  await page.getByRole('heading', { name: 'Hall of fame' }).waitFor()
  await shot('6-insights.jpg')
  await browser.close()
} finally {
  server.kill()
  rmSync(build, { recursive: true, force: true })
}
