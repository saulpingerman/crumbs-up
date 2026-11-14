/// <reference types="vite/client" />

/** Injected by Vite from package.json. */
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  /** Override where the cookie-finder model is downloaded from (to self-host it). */
  readonly VITE_COOKIE_FINDER_MODEL_URL?: string
}
