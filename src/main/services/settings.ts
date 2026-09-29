import { getDb } from './db'
import type { Appearance, Settings } from '../../shared/types'

const KEY_SETTINGS = 'settings'
const KEY_APPEARANCE = 'appearance'

const DEFAULT_SETTINGS: Settings = {
  retentionDays: 30,
  thumbCacheMB: 512,
  videoCacheMB: 2048
}

const DEFAULT_APPEARANCE: Appearance = {
  uiTheme: 'dark',
  uiBg: 'aurora',
  uiBgCustom: '#1a1a2e',
  viewerBg: 'follow',
  viewerBgCustom: '#141414'
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const row = getDb().prepare('SELECT v FROM settings WHERE k = ?').get(key) as
      | { v: string }
      | undefined
    if (!row) return fallback
    return { ...fallback, ...(JSON.parse(row.v) as T) }
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  getDb()
    .prepare(
      'INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v'
    )
    .run(key, JSON.stringify(value))
}

export function getSettings(): Settings {
  return readJson(KEY_SETTINGS, DEFAULT_SETTINGS)
}

export function setSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch }
  writeJson(KEY_SETTINGS, next)
  return next
}

export function getAppearance(): Appearance {
  return readJson(KEY_APPEARANCE, DEFAULT_APPEARANCE)
}

export function setAppearance(patch: Partial<Appearance>): Appearance {
  const next = { ...getAppearance(), ...patch }
  writeJson(KEY_APPEARANCE, next)
  return next
}
