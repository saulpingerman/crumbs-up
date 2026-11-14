import { useSyncExternalStore } from 'react'
import {
  WEIGHT_PRESETS,
  type OverallPrecision,
  type WeightPreset,
  type Weights,
} from '@/lib/rubric'

export type ThemeChoice = 'system' | 'light' | 'dark'

export interface Settings {
  theme: ThemeChoice
  weightPreset: WeightPreset
  overallPrecision: OverallPrecision
  /** Last state picked, so the next cookie starts there. */
  lastState: string
  lastBackupAt: number | null
  /** Cookies saved or changed since the last backup. */
  changesSinceBackup: number
  installHintDismissed: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  weightPreset: 'equal',
  overallPrecision: 'half',
  lastState: '',
  lastBackupAt: null,
  changesSinceBackup: 0,
  installHintDismissed: false,
}

const KEY = 'crumbs-up:settings'
const listeners = new Set<() => void>()
let cache: Settings | null = null

function read(): Settings {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? (JSON.parse(raw) as Partial<Settings>) : {}
    cache = { ...DEFAULT_SETTINGS, ...parsed }
    if (!(cache.weightPreset in WEIGHT_PRESETS)) cache.weightPreset = DEFAULT_SETTINGS.weightPreset
  } catch {
    cache = { ...DEFAULT_SETTINGS }
  }
  return cache
}

export function getSettings(): Settings {
  return read()
}

export function updateSettings(patch: Partial<Settings>): void {
  cache = { ...read(), ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(cache))
  } catch {
    // Private mode or a full disk: settings just won't survive a reload.
  }
  if ('theme' in patch) applyTheme(cache.theme)
  for (const l of listeners) l()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_SETTINGS)
}

export function weightsFor(settings: Pick<Settings, 'weightPreset'>): Weights {
  return WEIGHT_PRESETS[settings.weightPreset].weights
}

/* --------------------------------- Theme -------------------------------- */

const THEME_COLORS = { light: '#faf4e8', dark: '#17100c' } as const

export function resolveTheme(choice: ThemeChoice): 'light' | 'dark' {
  if (choice !== 'system') return choice
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(choice: ThemeChoice = read().theme): void {
  const resolved = resolveTheme(choice)
  document.documentElement.classList.toggle('dark', resolved === 'dark')
  // Installed web apps tint their status bar from this tag.
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute('content', THEME_COLORS[resolved])
  }
}

export function watchSystemTheme(): () => void {
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  const onChange = () => {
    if (read().theme === 'system') applyTheme('system')
  }
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
