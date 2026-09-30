import * as path from 'path'
import { shell } from 'electron'
import { promises as fsp } from 'fs'
import type { BatchResult } from '../../shared/types'
import { getDb, getAssetRow } from './db'
import { trashDir } from './library'
import { collisionFreePath, exists, formatError, isSubPath } from './util'
import { emitAssets, emitRemoved, refreshAlbumCover } from './emitter'
import { suppressWatch } from './watcher'

async function moveFile(src: string, dest: string): Promise<void> {
  try {
    await fsp.rename(src, dest)
  } catch {
    // 跨盘移动:复制后删除
    await fsp.copyFile(src, dest)
    await fsp.rm(src, { force: true })
  }
}

/** 移入应用回收站:仅标记删除,原文件原地不动;只有「删除到系统回收站」才会移除文件 */
export async function moveToTrash(ids: number[]): Promise<BatchResult[]> {
  const results: BatchResult[] = []
  const touched: number[] = []
  const now = Date.now()
  for (const id of ids) {
    try {
      const row = getAssetRow(id)
      if (!row) throw new Error('素材不存在')
      if (row.deleted_at) throw new Error('已在回收站中')
      getDb().prepare('UPDATE assets SET deleted_at = ? WHERE id = ?').run(now, id)
      touched.push(id)
      results.push({ id, ok: true })
    } catch (e) {
      results.push({ id, ok: false, error: formatError(e) })
    }
  }
  if (touched.length) {
    emitAssets(touched)
    refreshCoversOf(touched)
  }
  return results
}

function refreshCoversOf(ids: number[]): void {
  const db = getDb()
  const albumIds = new Set<number>()
  for (const id of ids) {
    const rows = db.prepare('SELECT album_id FROM album_assets WHERE asset_id = ?').all(id) as {
      album_id: number
    }[]
    for (const r of rows) albumIds.add(r.album_id)
  }
  for (const aid of albumIds) refreshAlbumCover(db, aid)
}

/** 从回收站恢复:软删除直接清除标记;旧版搬入 trash 目录的文件搬回原位置,被占用时自动改名 */
export async function restoreFromTrash(ids: number[]): Promise<BatchResult[]> {
  const results: BatchResult[] = []
  const touched: number[] = []
  for (const id of ids) {
    try {
      const row = getAssetRow(id)
      if (!row) throw new Error('素材不存在')
      if (!row.deleted_at) throw new Error('素材不在回收站中')
      const legacy = isSubPath(trashDir(), row.file_path)
      if (legacy) {
        const target = row.original_path || row.file_path
        const dir = path.dirname(target)
        await fsp.mkdir(dir, { recursive: true }).catch(() => {})
        const finalPath = await collisionFreePath(dir, path.basename(target))
        if (await exists(row.file_path)) {
          suppressWatch(row.file_path)
          suppressWatch(finalPath)
          await moveFile(row.file_path, finalPath)
        } else {
          throw new Error('回收区文件已丢失')
        }
        getDb()
          .prepare(
            `UPDATE assets SET file_path = ?, file_name = ?, original_path = NULL,
               deleted_at = NULL, missing = 0 WHERE id = ?`
          )
          .run(finalPath, path.basename(finalPath), id)
      } else {
        // 软删除:原文件应仍在原位
        if (!(await exists(row.file_path))) {
          getDb().prepare('UPDATE assets SET deleted_at = NULL, missing = 1 WHERE id = ?').run(id)
          touched.push(id)
          results.push({ id, ok: false, error: '原文件已不存在,已标记为缺失' })
          continue
        }
        getDb().prepare('UPDATE assets SET deleted_at = NULL, missing = 0 WHERE id = ?').run(id)
      }
      touched.push(id)
      results.push({ id, ok: true })
    } catch (e) {
      results.push({ id, ok: false, error: formatError(e) })
    }
  }
  if (touched.length) {
    emitAssets(touched)
    refreshCoversOf(touched)
  }
  return results
}

function deleteAssetRecord(id: number): void {
  const db = getDb()
  db.prepare('DELETE FROM asset_tags WHERE asset_id = ?').run(id)
  db.prepare('DELETE FROM album_assets WHERE asset_id = ?').run(id)
  db.prepare('DELETE FROM assets WHERE id = ?').run(id)
}

/** 删除到系统回收站(仍可从 Windows 回收站还原) */
export async function deleteForever(ids: number[]): Promise<BatchResult[]> {
  const results: BatchResult[] = []
  const removed: number[] = []
  for (const id of ids) {
    try {
      const row = getAssetRow(id)
      if (!row) throw new Error('素材不存在')
      if (await exists(row.file_path)) {
        await shell.trashItem(row.file_path)
      }
      deleteAssetRecord(id)
      removed.push(id)
      results.push({ id, ok: true })
    } catch (e) {
      results.push({ id, ok: false, error: formatError(e) })
    }
  }
  if (removed.length) {
    emitRemoved(removed)
    refreshCoversOf(removed)
  }
  return results
}

/** 回收区到期清理(0 = 不自动清理):把原文件送入系统回收站并移除记录 */
export async function purgeExpired(retentionDays: number): Promise<number> {
  if (!retentionDays || retentionDays <= 0) return 0
  const cutoff = Date.now() - retentionDays * 24 * 3600 * 1000
  const rows = getDb()
    .prepare('SELECT id, file_path FROM assets WHERE deleted_at IS NOT NULL AND deleted_at < ?')
    .all(cutoff) as { id: number; file_path: string }[]
  let count = 0
  const removed: number[] = []
  for (const r of rows) {
    try {
      if (await exists(r.file_path)) {
        await shell.trashItem(r.file_path)
      }
      deleteAssetRecord(r.id)
      count++
      removed.push(r.id)
    } catch {
      // 删除失败保留记录,下次再试
    }
  }
  if (removed.length) emitRemoved(removed)
  return count
}

/** 清理孤儿文件:trash 目录中已无记录对应的文件送入系统回收站 */
export async function cleanOrphanTrashFiles(): Promise<number> {
  const db = getDb()
  let names: string[]
  try {
    names = await fsp.readdir(trashDir())
  } catch {
    return 0
  }
  let count = 0
  for (const n of names) {
    const p = path.join(trashDir(), n)
    const rec = db
      .prepare('SELECT id FROM assets WHERE file_path = ?')
      .get(p) as { id: number } | undefined
    if (!rec && isSubPath(trashDir(), p)) {
      try {
        await shell.trashItem(p)
        count++
      } catch {
        /* 跳过 */
      }
    }
  }
  return count
}
