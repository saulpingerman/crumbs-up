import type { CapacitorConfig } from '@capacitor/cli'

/**
 * The iPhone app: the same site, built into dist/ and wrapped in a native
 * shell. `npm run ios` builds the site, copies it in and opens Xcode.
 */
const config: CapacitorConfig = {
  appId: 'com.crumbsup.app',
  appName: 'Crumbs Up',
  webDir: 'dist',
  ios: {
    // The page draws its own safe-area padding (viewport-fit=cover).
    contentInset: 'never',
    backgroundColor: '#faf4e8',
  },
}

export default config
