import * as path from 'path'
import * as fs from 'fs'
import { promises as fsp } from 'fs'
import type { ImportReport } from '../../shared/types'
import { ALL_EXTS, extOf, kindOfExt, sha256File, exists, collisionFreePath, isSubPath } from './util'
import { getDb, getAssetRow } from './db'
import { mediaDir, trashDir } from './library'
import { enqueueThumb } from './thumbs'
import { emitAssets, emitCollections, broadcast, refreshAlbumCover } from './emitter'
import { readVideoInfo } from './video'
import { computePhash } from './phash'
import { rebuildWatchRoots } from './watcher'

let cancelled = false

export interface ImportEntry {
  path: string
  isDir: boolean
}

export function cancelImport(): void {
  cancelled = true
}

/** 递归扫描目录中的全部媒体文件 */
export async function scanDirectory(
  root: string,
  files: string[] = [],
  depth = 0
): Promise<string[]> {
  if (depth > 12) return files
  let entries: fs.Dirent[]
  try {
    entries = await fsp.readdir(root, { withFileTypes: true })
  } catch {
    return files
  }
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name.startsWith('$')) continue
    const p = path.join(root, e.name)
    if (e.isDirectory()) {
      await scanDirectory(p, files, depth + 1)
    } else if (e.isFile() && ALL_EXTS.includes(extOf(e.name))) {
      files.push(p)
    }
  }
  return files
}

/** 确保目录相册存在(同一路径不重复创建),返回相册 id */
function ensureAlbumForDir(dirPath: string, createdNames: string[]): number {
  const db = getDb()
  const norm = path.resolve(dirPath)
  const existing = db.prepare('SELECT id FROM albums WHERE source_path = ?').get(norm) as
    | { id: number }
    | undefined
  if (existing) return existing.id
  const name = path.basename(norm) || norm
  const info = db
    .prepare('INSERT INTO albums (name, source_path, created_at) VALUES (?, ?, ?)')
    .run(name, norm, Date.now())
  createdNames.push(name)
  return Number(info.lastInsertRowid)
}

async function readImageDims(file: string, ext: string): Promise<{ w: number; h: number }> {
  const sharpMod = (await import('sharp')).default
  if (ext === 'ico') {
    // 手工读 ICO 目录头取最大帧尺寸
    const fd = await fsp.open(file, 'r')
    try {
      const head = Buffer.alloc(6)
      await fd.read(head, 0, 6, 0)
      const count = head.readUInt16LE(4)
      let bestW = 0
      let bestH = 0
      for (let i = 0; i < count; i++) {
        const e = Buffer.alloc(16)
        await fd.read(e, 0, 16, 6 + i * 16)
        const w = e[0] === 0 ? 256 : e[0]
        const h = e[1] === 0 ? 256 : e[1]
        if (w * h > bestW * bestH) {
          bestW = w
          bestH = h
        }
      }
      if (bestW) return { w: bestW, h: bestH }
    } finally {
      await fd.close()
    }
    return { w: 32, h: 32 }
  }
  const meta = await sharpMod(file, { failOn: 'none' }).metadata()
  const w = meta.width ?? 0
  const h = meta.height ?? 0
  // EXIF 方向交换宽高
  if (meta.orientation && meta.orientation >= 5) return { w: h, h: w }
  return { w, h }
}

export interface RunImportOptions {
  entries: ImportEntry[]
  mode: 'reference' | 'managed'
}

/** 导入主流程:哈希去重 → 引用/复制 → 记录 → 缩略图排队;进度事件可取消 */
export async function runImport({ entries, mode }: RunImportOptions): Promise<ImportReport> {
  cancelled = false
  const report: ImportReport = {
    total: 0,
    imported: 0,
    reused: 0,
    skipped: [],
    failed: [],
    cancelled: false,
    albumsCreated: []
  }
  const db = getDb()
  const touched: number[] = []
  const albumIds = new Set<number>()

  // 展开目录 + 建目录相册
  const files: { path: string; albumId: number | null }[] = []
  for (const e of entries) {
    if (e.isDir) {
      const albumId = ensureAlbumForDir(e.path, report.albumsCreated)
      albumIds.add(albumId)
      const found = await scanDirectory(e.path)
      for (const f of found) files.push({ path: f, albumId })
    } else {
      files.push({ path: e.path, albumId: null })
    }
  }
  report.total = files.length
  if (!report.total) {
    report.skipped.push({ file: '(未选择内容)', reason: '未找到可导入的媒体文件' })
    return report
  }

  let done = 0
  const sendProgress = (label: string): void => {
    broadcast('import:progress', { done, total: report.total, label })
  }

  for (const item of files) {
    if (cancelled) {
      report.cancelled = true
      report.skipped.push({ file: item.path, reason: '已取消导入' })
      done++
      continue
    }
    sendProgress(path.basename(item.path))
    try {
      const ext = extOf(item.path)
      if (!ALL_EXTS.includes(ext)) {
        report.skipped.push({ file: item.path, reason: `不支持的格式 .${ext}` })
        continue
      }
      const st = await fsp.stat(item.path).catch(() => null)
      if (!st || !st.isFile()) {
        report.failed.push({ file: item.path, reason: '文件不存在或不可读' })
        continue
      }
      const hash = await sha256File(item.path)

      // 内容去重:在库记录直接复用
      const active = db
        .prepare(
          'SELECT id, file_path, missing FROM assets WHERE content_hash = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1'
        )
        .get(hash) as { id: number; file_path: string; missing: number } | undefined
      if (active) {
        let changed = false
        if (active.missing || !(await exists(active.file_path))) {
          // 原文件已缺失,顺路按新位置找回
          db.prepare('UPDATE assets SET file_path = ?, missing = 0 WHERE id = ?').run(
            item.path,
            active.id
          )
          changed = true
        }
        if (item.albumId) {
          const r = db
            .prepare('INSERT OR IGNORE INTO album_assets (album_id, asset_id) VALUES (?, ?)')
            .run(item.albumId, active.id)
          changed = changed || Number(r.changes) > 0
          albumIds.add(item.albumId)
        }
        report.reused++
        if (changed) touched.push(active.id)
        continue
      }

      // 存进库模式:先复制文件
      let finalPath = item.path
      if (mode === 'managed') {
        const dest = await collisionFreePath(mediaDir(), path.basename(item.path))
        await fsp.copyFile(item.path, dest)
        finalPath = dest
      }

      // 回收站里已有同内容记录 → 复活该记录(清掉回收区旧文件)
      const trashed = db
        .prepare(
          'SELECT id, file_path FROM assets WHERE content_hash = ? AND deleted_at IS NOT NULL ORDER BY id DESC LIMIT 1'
        )
        .get(hash) as { id: number; file_path: string } | undefined
      if (trashed) {
        db.prepare(
          `UPDATE assets SET file_path = ?, original_path = NULL, storage_mode = ?, deleted_at = NULL,
             missing = 0, file_size = ?, file_modified_at = ? WHERE id = ?`
        ).run(finalPath, mode, st.size, Math.round(st.mtimeMs), trashed.id)
        if (isSubPath(trashDir(), trashed.file_path)) {
          await fsp.rm(trashed.file_path, { force: true }).catch(() => {})
        }
        if (item.albumId) {
          db.prepare('INSERT OR IGNORE INTO album_assets (album_id, asset_id) VALUES (?, ?)').run(
            item.albumId,
            trashed.id
          )
          albumIds.add(item.albumId)
        }
        report.reused++
        touched.push(trashed.id)
        continue
      }

      // 新记录
      const kind = kindOfExt(ext)
      let width = 0
      let height = 0
      let durationMs: number | null = null
      let videoInfo: string | null = null
      let phash: string | null = null
      if (kind === 'image') {
        const d = await readImageDims(finalPath, ext).catch(() => ({ w: 0, h: 0 }))
        width = d.w
        height = d.h
        phash = await computePhash(finalPath)
      } else {
        const info = await readVideoInfo(finalPath).catch(() => null)
        if (info) {
          width = info.width
          height = info.height
          durationMs = info.durationMs
          videoInfo = JSON.stringify(info)
        }
      }

      const id = Number(
        db
          .prepare(
            `INSERT INTO assets (content_hash, file_path, storage_mode, file_name, ext, kind,
              width, height, file_size, duration_ms, video_info, phash, imported_at, file_modified_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            hash,
            finalPath,
            mode,
            path.basename(finalPath),
            ext,
            kind,
            width,
            height,
            st.size,
            durationMs,
            videoInfo,
            phash,
            Date.now(),
            Math.round(st.mtimeMs)
          ).lastInsertRowid
      )
      if (item.albumId) {
        db.prepare('INSERT OR IGNORE INTO album_assets (album_id, asset_id) VALUES (?, ?)').run(
          item.albumId,
          id
        )
        albumIds.add(item.albumId)
      }
      report.imported++
      touched.push(id)
      enqueueThumb(id)
    } catch (e) {
      report.failed.push({ file: item.path, reason: (e as Error).message })
    } finally {
      done++
      sendProgress(path.basename(item.path))
    }
  }

  if (touched.length) emitAssets(touched)
  if (report.albumsCreated.length) emitCollections()
  for (const aid of albumIds) refreshAlbumCover(db, aid)
  // 新导入目录纳入监听,无需重启应用
  rebuildWatchRoots()
  return report
}

/** 引用素材转为「存进库」(复制入库,原文件保留不动) */
export async function convertToManaged(ids: number[]): Promise<{
  ok: number
  total: number
  errors: string[]
}> {
  const db = getDb()
  const errors: string[] = []
  let ok = 0
  const touched: number[] = []
  for (const id of ids) {
    const row = getAssetRow(id)
    if (!row) continue
    if (row.storage_mode === 'managed') {
      ok++
      continue
    }
    try {
      const dest = await collisionFreePath(mediaDir(), row.file_name)
      await fsp.copyFile(row.file_path, dest)
      db.prepare('UPDATE assets SET file_path = ?, storage_mode = ? WHERE id = ?').run(
        dest,
        'managed',
        id
      )
      ok++
      touched.push(id)
    } catch (e) {
      errors.push(`${row.file_name}: ${(e as Error).message}`)
    }
  }
  if (touched.length) emitAssets(touched)
  return { ok, total: ids.length, errors }
}
