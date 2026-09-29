import { app } from 'electron'
import * as path from 'path'
import { promises as fsp } from 'fs'

export interface AppConfig {
  libraryRoot: string
  winBounds?: { x: number; y: number; width: number; height: number } | null
  winMaximized?: boolean
}

let cached: AppConfig | null = null

function configPath(): string {
  return path.join(app.getPath('userData'), 'config.json')
}

export function defaultLibraryRoot(): string {
  return path.join(app.getPath('pictures'), 'MediaViewerLibrary')
}

export function getConfig(): AppConfig {
  if (cached) return cached
  const def: AppConfig = { libraryRoot: defaultLibraryRoot(), winBounds: null }
  try {
    const raw = require('fs').readFileSync(configPath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<AppConfig>
    cached = { ...def, ...parsed }
  } catch {
    cached = def
  }
  return cached!
}

export function setConfig(patch: Partial<AppConfig>): void {
  const cur = getConfig()
  cached = { ...cur, ...patch }
  try {
    require('fs').mkdirSync(path.dirname(configPath()), { recursive: true })
    require('fs').writeFileSync(configPath(), JSON.stringify(cached, null, 2), 'utf8')
  } catch {
    // 配置写入失败不致命,下次启动回退默认
  }
}

export async function writeConfigAtomic(patch: Partial<AppConfig>): Promise<void> {
  const cur = getConfig()
  cached = { ...cur, ...patch }
  await fsp.mkdir(path.dirname(configPath()), { recursive: true })
  const tmp = configPath() + '.tmp'
  await fsp.writeFile(tmp, JSON.stringify(cached, null, 2), 'utf8')
  await fsp.rename(tmp, configPath())
}
