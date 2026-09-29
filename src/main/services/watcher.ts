import * as path from 'path'
import { promises as fsp } from 'fs'
import chokidar from 'chokidar'
import { getDb, getAssetRow } from './db'
import { libraryRoot } from './library'
import { sha256File, isSubPath } from './util'
import { emitAsset } from './emitter'
import { enqueueThumb } from './thumbs'

let watcher: chokidar.FSWatcher | null = null
let building = false

/** 应用自身操作触发的文件事件抑制窗口 */
const suppressed = new Map<string, number>()

export function suppressWatch(p: string): void {
  suppressed.set(p, Date.now() + 8000)
}

function isSuppressed(p: string): boolean {
  const until = suppressed.get(p)
  if (!until) return false
  if (Date.now() > until) {
    suppressed.delete(p)
    return false
  }
  return true
}

/** 取所有需监听的目录(在库引用素材所在目录,去重并合并父子目录) */
function computeRoots(): string[] {
  const rows = getDb()
    .prepare(
      `SELECT file_path FROM assets WHERE deleted_at IS NULL AND missing = 0 AND storage_mode = 'reference'`
    )
    .all() as { file_path: string }[]
  const lib = path.resolve(libraryRoot())
  const dirs = new Set<string>()
  for (const r of rows) {
    const d = path.dirname(r.file_path)
    if (isSubPath(lib, d)) continue // 图库内部目录不监听
    dirs.add(path.resolve(d))
  }
  // 合并:若某目录是已选目录的子目录则去掉
  const sorted = [...dirs].sort((a, b) => a.length - b.length)
  const roots: string[] = []
  for (const d of sorted) {
    if (!roots.some((r) => isSubPath(r, d))) roots.push(d)
  }
  return roots
}

/** 重建监听(导入新目录后自动调用,无需重启) */
export async function rebuildWatchRoots(): Promise<void> {
  if (building) return
  building = true
  try {
    if (watcher) {
      await watcher.close().catch(() => {})
      watcher = null
    }
    const roots = computeRoots()
    if (!roots.length) return
    watcher = chokidar.watch(roots, {
      ignoreInitial: true,
      ignorePermissionErrors: true,
      depth: 6,
      awaitWriteFinish: { stabilityThreshold: 600, pollInterval: 100 }
    })
    watcher.on('add', (p) => void onAdd(p))
    watcher.on('change', (p) => void onChange(p))
    watcher.on('unlink', (p) => void onUnlink(p))
    watcher.on('unlinkDir', (p) => void onUnlinkDir(p))
    watcher.on('error', () => {
      /* 单目录监听失败不影响整体 */
    })
  } finally {
    building = false
  }
}

function assetByPath(p: string): { id: number; missing: number; file_size: number } | undefined {
  return getDb()
    .prepare('SELECT id, missing, file_size FROM assets WHERE file_path = ?')
    .get(p) as { id: number; missing: number; file_size: number } | undefined
}

async function onUnlink(p: string): Promise<void> {
  if (isSuppressed(p)) return
  const a = assetByPath(p)
  if (a) {
    getDb().prepare('UPDATE assets SET missing = 1 WHERE id = ?').run(a.id)
    emitAsset(a.id)
  }
}

async function onUnlinkDir(p: string): Promise<void> {
  const prefix = path.resolve(p) + path.sep
  const rows = getDb()
    .prepare(`SELECT id, file_path FROM assets WHERE file_path LIKE ? AND missing = 0`)
    .all(`${prefix}%`) as { id: number; file_path: string }[]
  for (const r of rows) {
    if (isSuppressed(r.file_path)) continue
    getDb().prepare('UPDATE assets SET missing = 1 WHERE id = ?').run(r.id)
    emitAsset(r.id)
  }
}

/** 外部恢复/改名:路径直接匹配或按"大小一致 + 内容一致"确认(内容变过的文件不认) */
async function onAdd(p: string): Promise<void> {
  const direct = assetByPath(p)
  if (direct) {
    if (!direct.missing) {
      void onChange(p)
      return
    }
    if (await contentMatches(p, direct.file_size)) {
      getDb().prepare('UPDATE assets SET missing = 0 WHERE id = ?').run(direct.id)
      emitAsset(direct.id)
    }
    return
  }
  // 大小匹配的缺失素材 → 哈希确认
  const st = await fsp.stat(p).catch(() => null)
  if (!st) return
  const candidates = getDb()
    .prepare(`SELECT id, file_size FROM assets WHERE missing = 1 AND deleted_at IS NULL AND file_size = ?`)
    .all(st.size) as { id: number; file_size: number }[]
  for (const c of candidates) {
    if (await contentMatches(p, c.file_size, c.id)) {
      getDb().prepare('UPDATE assets SET file_path = ?, missing = 0 WHERE id = ?').run(p, c.id)
      emitAsset(c.id)
      return
    }
  }
}

async function contentMatches(p: string, expectedSize: number, assetId?: number): Promise<boolean> {
  const st = await fsp.stat(p).catch(() => null)
  if (!st || st.size !== expectedSize) return false
  const hash = await sha256File(p).catch(() => null)
  if (!hash) return false
  if (assetId !== undefined) {
    const row = getAssetRow(assetId)
    return !!row && row.content_hash === hash
  }
  const row = getDb().prepare('SELECT content_hash FROM assets WHERE file_path = ?').get(p) as
    | { content_hash: string }
    | undefined
  return !!row && row.content_hash === hash
}

const changeTimers = new Map<string, ReturnType<typeof setTimeout>>()

/** 外部改动:更新大小/时间,重生成缩略图与主色(哈希同步重算) */
async function onChange(p: string): Promise<void> {
  if (isSuppressed(p)) return
  const t = changeTimers.get(p)
  if (t) clearTimeout(t)
  changeTimers.set(
    p,
    setTimeout(() => {
      changeTimers.delete(p)
      void handleChange(p)
    }, 800)
  )
}

async function handleChange(p: string): Promise<void> {
  const a = assetByPath(p)
  if (!a) return
  const st = await fsp.stat(p).catch(() => null)
  if (!st) return
  const hash = await sha256File(p).catch(() => null)
  getDb()
    .prepare(
      'UPDATE assets SET file_size = ?, file_modified_at = ?, content_hash = COALESCE(?, content_hash) WHERE id = ?'
    )
    .run(st.size, Math.round(st.mtimeMs), hash, a.id)
  if (hash) {
    getDb().prepare('UPDATE assets SET thumb_done = 0 WHERE id = ?').run(a.id)
    enqueueThumb(a.id)
  }
  emitAsset(a.id)
}
