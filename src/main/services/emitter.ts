import { BrowserWindow } from 'electron'
import type { Asset } from '../../shared/types'
import { getAsset } from './db'

/** 向所有窗口广播事件 */
export function broadcast(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) {
      w.webContents.send(channel, payload)
    }
  }
}

/** 素材记录变化后推送给渲染进程 */
export function emitAssets(ids: number[]): void {
  const assets: Asset[] = []
  for (const id of ids) {
    const a = getAsset(id)
    if (a) assets.push(a)
  }
  if (assets.length) broadcast('lib:changed', { upserted: assets, removed: [] })
}

export function emitAsset(id: number | undefined): void {
  if (id) emitAssets([id])
}

export function emitRemoved(ids: number[]): void {
  if (ids.length) broadcast('lib:changed', { upserted: [], removed: ids })
}

/** 标签/相册集合发生变化(增删、成员变化后由 ipc 层附带新列表) */
export function emitCollections(): void {
  broadcast('lib:collections', {})
}

/** 刷新相册封面(取第一个成员) */
export function refreshAlbumCover(db: import('better-sqlite3').Database, albumId: number): void {
  const first = db
    .prepare(
      `SELECT a.id FROM album_assets aa JOIN assets a ON a.id = aa.asset_id
       WHERE aa.album_id = ? AND a.deleted_at IS NULL ORDER BY a.imported_at ASC, a.id ASC LIMIT 1`
    )
    .get(albumId) as { id: number } | undefined
  db.prepare('UPDATE albums SET cover_asset_id = ? WHERE id = ?').run(first?.id ?? null, albumId)
}
