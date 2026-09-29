import * as path from 'path'
import * as fs from 'fs'
import { promises as fsp } from 'fs'
import { broadcast } from './emitter'
import { getConfig, setConfig, defaultLibraryRoot } from './config'
import { initDb, closeDb, getDb } from './db'
import { exists } from './util'

let currentRoot = ''

export function libraryRoot(): string {
  return currentRoot
}

export function mediaDir(): string {
  return path.join(currentRoot, 'media')
}
export function thumbsDir(): string {
  return path.join(currentRoot, 'thumbs')
}
export function videoCacheDir(): string {
  return path.join(currentRoot, 'video-cache')
}
export function trashDir(): string {
  return path.join(currentRoot, 'trash')
}
export function dbPath(): string {
  return path.join(currentRoot, 'library.db')
}

/** 初始化图库:确保目录与数据库就绪 */
export function initLibrary(): void {
  let root = getConfig().libraryRoot || defaultLibraryRoot()
  try {
    fs.mkdirSync(root, { recursive: true })
    fs.accessSync(root, fs.constants.W_OK)
  } catch {
    root = defaultLibraryRoot()
    fs.mkdirSync(root, { recursive: true })
    setConfig({ libraryRoot: root })
  }
  currentRoot = root
  for (const d of [mediaDir(), thumbsDir(), videoCacheDir(), trashDir()]) {
    fs.mkdirSync(d, { recursive: true })
  }
  initDb(root)
}

/** 整库迁移:复制式,原库保留;完成后调用方提示重启 */
export async function migrateLibrary(newRoot: string): Promise<void> {
  if (!newRoot || path.resolve(newRoot) === path.resolve(currentRoot)) {
    throw new Error('新位置与当前图库位置相同')
  }
  const probe = path.join(newRoot, '.mv-write-test')
  await fsp.mkdir(newRoot, { recursive: true })
  await fsp.writeFile(probe, 'ok')
  await fsp.rm(probe)

  closeDb()
  broadcast('migrate:progress', { phase: '开始迁移', pct: 0 })
  const dirs = ['media', 'thumbs', 'video-cache', 'trash']
  let done = 0
  for (const d of dirs) {
    const src = path.join(currentRoot, d)
    if (await exists(src)) {
      await fsp.cp(src, path.join(newRoot, d), { recursive: true, force: false })
    }
    done++
    broadcast('migrate:progress', {
      phase: `复制 ${d}`,
      pct: Math.round((done / (dirs.length + 1)) * 100)
    })
  }
  broadcast('migrate:progress', { phase: '复制数据库', pct: 90 })
  await fsp.cp(dbPath(), path.join(newRoot, 'library.db'), { force: false })
  const wal = dbPath() + '-wal'
  if (await exists(wal)) await fsp.cp(wal, path.join(newRoot, 'library.db-wal'), { force: true })
  const shm = dbPath() + '-shm'
  if (await exists(shm)) await fsp.cp(shm, path.join(newRoot, 'library.db-shm'), { force: true })

  currentRoot = newRoot
  setConfig({ libraryRoot: newRoot })
  initDb(newRoot)
  void getDb()
  broadcast('migrate:progress', { phase: '完成', pct: 100 })
}
