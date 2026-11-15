import { Capacitor } from '@capacitor/core'

/**
 * Running inside the iPhone app rather than a browser. The app bundles its
 * own files and is updated through the App Store, and some web-only ways of
 * signing in don't work inside it.
 */
export const isNativeApp = Capacitor.isNativePlatform()
