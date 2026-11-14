import { defineConfig, devices } from '@playwright/test'

const PORT = 4173

/**
 * End-to-end tests run against the production build, service worker and all,
 * at phone size — the way the app is really used.
 *
 * Set PLAYWRIGHT_CHROMIUM_PATH to reuse a Chromium that is already installed
 * instead of the one `npx playwright install chromium` downloads.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
  projects: [
    {
      name: 'phone',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    // The tests must not lean on the live Supabase project that production
    // builds are pointed at (.env.production). Unless a run supplies its own
    // (the account tests do, pointing at a local one), build with accounts off.
    env: {
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? '',
      VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
      // Likewise Google's sign-in box: only where a run asks for it.
      VITE_GOOGLE_CLIENT_ID: process.env.VITE_GOOGLE_CLIENT_ID ?? '',
    },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
