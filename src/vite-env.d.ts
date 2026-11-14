/// <reference types="vite/client" />

/** Injected by Vite from package.json. */
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  /** Override where the cookie-finder model is downloaded from (to self-host it). */
  readonly VITE_COOKIE_FINDER_MODEL_URL?: string
  /** Supabase project URL. Accounts and sync are switched on when this and the key are set. */
  readonly VITE_SUPABASE_URL?: string
  /** Supabase publishable key (`sb_publishable_…`). Public by design. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
}
