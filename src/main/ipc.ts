import { ipcMain, dialog, app, BrowserWindow } from 'electron'
import * as path from 'path'
import { getDb, listAssets, listTags, listAlbums, getAssetRow, rowToFull } from './services/db'
import { runImport, cancelImport, convertToManaged, type ImportEntry } from './services/importer'
import { getMainWindow } from './window'
import { getSettings, setSettings, getAppearance, setAppearance } from './services/settings'
import { migrateLibrary, libraryRoot } from './services/library'
import { moveToTrash, restoreFromTrash, deleteForever } from './services/trash'
import { shell } from 'electron'
import { relocateAsset } from './services/relocate'
import { findSimilarPairs } from './services/phash'
import { exportAssets, type ExportOptions } from './services/exporter'
import { applyTransform, renameAsset, saveAssetAs, type ExportFormat } from './services/images'
import { getPlayInfo, getVideoInfoOf, notifyPlaying, trimVideoCache } from './services/video'
import { computeHistogram } from './services/histogram'
import { readExif, readAiMeta } from './services/meta'
import { rebuildThumb } from './services/thumbs'
import { emitAsset, emitAssets, refreshAlbumCover, broadcast } from './services/emitter'
import { fileUrl } from './protocol'
import { sanitizeFileName } from './services/util'
import {
  computeDiff,
  exportComposite,
  computeQuality,
  recordVote,
  getPairScore
} from './services/compare'
import type { Album, Tag, ExportCompareType } from '../shared/types'

function win(): BrowserWindow | null {
  return getMainWindow()
}

function parent(): BrowserWindow | undefined {
  return getMainWindow() ?? undefined
}

export function registerIpc(): void {
  // ---- 窗口控制 ----
  ipcMain.handle('win:minimize', () => win()?.minimize())
  ipcMain.handle('win:maximize', (e) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (!w) return
    if (w.isMaximized()) w.unmaximize()
    else w.maximize()
  })
  ipcMain.handle('win:close', () => win()?.close())
  ipcMain.handle('win:pin', (e) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (!w) return false
    const next = !w.isAlwaysOnTop()
    w.setAlwaysOnTop(next, 'screen-saver')
    return next
  })
  ipcMain.handle('win:reload', (e) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (!w) return
    const url = process.env['ELECTRON_RENDERER_URL']
    if (!app.isPackaged && url) w.loadURL(url)
    else w.loadFile(path.join(__dirname, '../renderer/index.html'))
  })
  ipcMain.handle('win:state:get', (e) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    return { maximized: !!w?.isMaximized(), pinned: !!w?.isAlwaysOnTop() }
  })
  ipcMain.handle('app:relaunch', () => {
    app.relaunch()
    app.exit(0)
  })
  ipcMain.handle('app:quit', () => app.quit())

  // ---- 文件选择对话框 ----
  const MEDIA_FILTERS = [
    {
      name: '媒体文件',
      extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff', 'tif', 'ico', 'svg',
        'mp4', 'm4v', 'mov', 'mkv', 'webm', 'avi']
    },
    { name: '所有文件', extensions: ['*'] }
  ]
  ipcMain.handle('dlg:pickFiles', async () => {
    const r = await dialog.showOpenDialog(parent()!, {
      title: '选择要导入的素材',
      filters: MEDIA_FILTERS,
      properties: ['openFile', 'multiSelections']
    })
    return r.canceled ? [] : r.filePaths
  })
  ipcMain.handle('dlg:pickDirs', async () => {
    const r = await dialog.showOpenDialog(parent()!, {
      title: '选择要添加的目录',
      properties: ['openDirectory', 'multiSelections']
    })
    return r.canceled ? [] : r.filePaths
  })
  ipcMain.handle('dlg:pickFolder', async () => {
    const r = await dialog.showOpenDialog(parent()!, {
      title: '选择搜索位置',
      properties: ['openDirectory']
    })
    return r.canceled ? null : r.filePaths[0]
  })

  // ---- 导入 ----
  ipcMain.handle(
    'import:run',
    (_e, args: { entries: ImportEntry[]; mode: 'reference' | 'managed' }) =>
      runImport(args)
  )
  ipcMain.handle('import:cancel', () => cancelImport())

  // ---- 素材数据 ----
  ipcMain.handle('assets:list', () => ({
    assets: listAssets(),
    tags: listTags(),
    albums: listAlbums()
  }))
  ipcMain.handle('assets:get', async (_e, id: number) => {
    const row = getAssetRow(id)
    if (!row) throw new Error('素材不存在')
    let full = rowToFull(row)
    // 懒加载并缓存:EXIF / AI 参数 / 视频信息
    if (row.kind === 'image' && !row.exif && !row.ai_meta) {
      const [exif, ai] = await Promise.all([
        readExif(row.file_path),
        readAiMeta(row.file_path, row.ext)
      ])
      getDb()
        .prepare('UPDATE assets SET exif = ?, ai_meta = ? WHERE id = ?')
        .run(JSON.stringify(exif), JSON.stringify(ai), id)
      full = { ...full, exif, aiMeta: ai }
    } else if (row.kind === 'video' && !row.video_info) {
      const info = await getVideoInfoOf(id).catch(() => null)
      if (info) full = { ...full, videoInfo: info }
    }
    return full
  })
  ipcMain.handle(
    'assets:update',
    (_e, args: { id: number; patch: { rating?: number; favorite?: boolean; note?: string } }) => {
      const row = getAssetRow(args.id)
      if (!row) throw new Error('素材不存在')
      if (row.deleted_at) throw new Error('回收站内的素材不可修改')
      const sets: string[] = []
      const vals: unknown[] = []
      if (args.patch.rating !== undefined) {
        const r = Math.max(0, Math.min(5, Math.round(args.patch.rating)))
        sets.push('rating = ?')
        vals.push(r)
      }
      if (args.patch.favorite !== undefined) {
        sets.push('favorite = ?')
        vals.push(args.patch.favorite ? 1 : 0)
      }
      if (args.patch.note !== undefined) {
        sets.push('note = ?')
        vals.push(String(args.patch.note).slice(0, 20000))
      }
      if (!sets.length) return getAssetRow(args.id)
      vals.push(args.id)
      getDb().prepare(`UPDATE assets SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
      emitAsset(args.id)
      return rowToFull(getAssetRow(args.id)!)
    }
  )
  ipcMain.handle('assets:rename', (_e, args: { id: number; name: string }) => {
    const name = sanitizeFileName(args.name)
    const actual = renameAsset(args.id, name)
    return actual
  })
  ipcMain.handle('assets:toTrash', (_e, ids: number[]) => moveToTrash(ids))
  ipcMain.handle('assets:restore', (_e, ids: number[]) => restoreFromTrash(ids))
  ipcMain.handle('assets:deleteForever', (_e, ids: number[]) => deleteForever(ids))
  ipcMain.handle('assets:relocate', async (_e, id: number) => {
    const folder = await dialog.showOpenDialog(parent()!, {
      title: '选择重新定位的搜索位置',
      properties: ['openDirectory']
    })
    if (folder.canceled || !folder.filePaths.length) return { found: false, canceled: true }
    const found = await relocateAsset(id, folder.filePaths[0])
    return { found, canceled: false }
  })
  ipcMain.handle('assets:convertToManaged', (_e, ids: number[]) => convertToManaged(ids))
  ipcMain.handle('assets:findSimilar', (_e, threshold: number) =>
    findSimilarPairs(Math.max(1, Math.min(30, Math.round(threshold) || 10)))
  )
  ipcMain.handle('assets:exportBatch', (_e, args: { ids: number[]; opts: ExportOptions }) =>
    exportAssets(args.ids, args.opts)
  )
  ipcMain.handle('assets:showInFolder', (_e, id: number) => {
    const row = getAssetRow(id)
    if (!row) throw new Error('素材不存在')
    shell.showItemInFolder(row.file_path)
  })

  // ---- 标签 ----
  ipcMain.handle('tags:create', (_e, nameRaw: string) => {
    const name = nameRaw.trim()
    if (!name) throw new Error('标签名不能为空')
    if (name.length > 100) throw new Error('标签最长 100 个字符')
    const db = getDb()
    const existsRow = db.prepare('SELECT id FROM tags WHERE name = ?').get(name)
    if (existsRow) throw new Error('已存在同名标签')
    const id = Number(
      db.prepare('INSERT INTO tags (name, created_at) VALUES (?, ?)').run(name, Date.now())
        .lastInsertRowid
    )
    return { id, name, usage: 0 } as Tag
  })
  ipcMain.handle('tags:assign', (_e, args: { assetIds: number[]; name: string }) => {
    const name = args.name.trim().slice(0, 100)
    if (!name) throw new Error('标签名不能为空')
    const db = getDb()
    let tag = db.prepare('SELECT id FROM tags WHERE name = ?').get(name) as
      | { id: number }
      | undefined
    if (!tag) {
      const id = Number(
        db.prepare('INSERT INTO tags (name, created_at) VALUES (?, ?)').run(name, Date.now())
          .lastInsertRowid
      )
      tag = { id }
    }
    for (const aid of args.assetIds) {
      const row = getAssetRow(aid)
      if (!row || row.deleted_at) continue
      db.prepare('INSERT OR IGNORE INTO asset_tags (asset_id, tag_id) VALUES (?, ?)').run(aid, tag.id)
    }
    emitAssets(args.assetIds)
    broadcast('lib:collections', {})
    return tag.id
  })
  ipcMain.handle('tags:unassign', (_e, args: { assetId: number; tagId: number }) => {
    getDb()
      .prepare('DELETE FROM asset_tags WHERE asset_id = ? AND tag_id = ?')
      .run(args.assetId, args.tagId)
    emitAsset(args.assetId)
    broadcast('lib:collections', {})
  })

  // ---- 相册 ----
  ipcMain.handle('albums:create', (_e, nameRaw: string) => {
    const name = nameRaw.trim()
    if (!name) throw new Error('相册名不能为空')
    const db = getDb()
    const id = Number(
      db.prepare('INSERT INTO albums (name, created_at) VALUES (?, ?)').run(name, Date.now())
        .lastInsertRowid
    )
    broadcast('lib:collections', {})
    return { id, name, sourcePath: null, coverAssetId: null, coverThumbPath: null, count: 0 } as Album
  })
  ipcMain.handle('albums:assign', (_e, args: { assetIds: number[]; albumId: number }) => {
    const db = getDb()
    for (const aid of args.assetIds) {
      const row = getAssetRow(aid)
      if (!row || row.deleted_at) continue
      db.prepare(
        'INSERT OR IGNORE INTO album_assets (album_id, asset_id) VALUES (?, ?)'
      ).run(args.albumId, aid)
    }
    refreshAlbumCover(db, args.albumId)
    emitAssets(args.assetIds)
    broadcast('lib:collections', {})
  })
  ipcMain.handle('albums:unassign', (_e, args: { assetId: number; albumId: number }) => {
    const db = getDb()
    db.prepare('DELETE FROM album_assets WHERE album_id = ? AND asset_id = ?').run(
      args.albumId,
      args.assetId
    )
    refreshAlbumCover(db, args.albumId)
    emitAsset(args.assetId)
    broadcast('lib:collections', {})
  })

  // ---- 元数据 ----
  ipcMain.handle('meta:histogram', async (_e, args: { id: number; force?: boolean }) => {
    const row = getAssetRow(args.id)
    if (!row || row.kind !== 'image') return null
    if (!args.force && row.histogram) return JSON.parse(row.histogram)
    const data = await computeHistogram(row.file_path)
    if (data) {
      getDb().prepare('UPDATE assets SET histogram = ? WHERE id = ?').run(
        JSON.stringify(data),
        args.id
      )
    }
    return data
  })
  ipcMain.handle('thumbs:rebuild', (_e, id: number) => rebuildThumb(id))

  // ---- 编辑器 ----
  ipcMain.handle(
    'editor:apply',
    (
      _e,
      args: {
        id: number
        crop?: { x: number; y: number; w: number; h: number }
        rotate?: number
        flipH?: boolean
        adjust?: { brightness: number; contrast: number; saturation: number }
      }
    ) => applyTransform(args.id, args)
  )
  ipcMain.handle('editor:saveAs', async (_e, args: { id: number; format: ExportFormat }) => {
    const row = getAssetRow(args.id)
    if (!row) throw new Error('素材不存在')
    const filters = {
      png: [{ name: 'PNG 图片', extensions: ['png'] }],
      jpg: [{ name: 'JPEG 图片', extensions: ['jpg'] }],
      webp: [{ name: 'WebP 图片', extensions: ['webp'] }],
      bmp: [{ name: 'BMP 位图', extensions: ['bmp'] }],
      gif: [{ name: 'GIF 图片', extensions: ['gif'] }]
    }[args.format]
    const r = await dialog.showSaveDialog(parent()!, {
      title: '另存为',
      defaultPath: path.join(
        path.dirname(row.file_path),
        path.basename(row.file_name, `.${row.ext}`) + `.${args.format}`
      ),
      filters
    })
    if (r.canceled || !r.filePath) return null
    await saveAssetAs(args.id, args.format, r.filePath)
    return r.filePath
  })

  // ---- 视频 ----
  ipcMain.handle('video:playInfo', (_e, id: number) =>
    getPlayInfo(id, (p) => fileUrl(p))
  )
  ipcMain.handle('video:info', (_e, id: number) => getVideoInfoOf(id))
  ipcMain.handle('video:playing', (_e, args: { path: string; on: boolean }) => {
    notifyPlaying(args.path, args.on)
    void trimVideoCache(getSettings().videoCacheMB)
  })

  // ---- 对比工作台 ----
  ipcMain.handle(
    'compare:diff',
    (_e, args: { aId: number; bId: number; forExport?: boolean }) =>
      computeDiff(args.aId, args.bId, !!args.forExport)
  )
  ipcMain.handle(
    'compare:export',
    (_e, args: { aId: number; bId: number; type: ExportCompareType; wipePct: number; flickerSide: 'a' | 'b' }) =>
      exportComposite(args)
  )
  ipcMain.handle('compare:quality', (_e, args: { refId: number; testId: number }) =>
    computeQuality(args.refId, args.testId)
  )
  ipcMain.handle(
    'compare:vote',
    (_e, args: { aId: number; bId: number; winnerIsA: boolean }) =>
      recordVote(args.aId, args.bId, args.winnerIsA)
  )
  ipcMain.handle('compare:score', (_e, args: { aId: number; bId: number }) =>
    getPairScore(args.aId, args.bId)
  )

  // ---- 设置与外观 ----
  ipcMain.handle('settings:get', () => ({
    settings: getSettings(),
    appearance: getAppearance(),
    libraryRoot: libraryRoot()
  }))
  ipcMain.handle('settings:set', (_e, patch: Record<string, unknown>) => setSettings(patch))
  ipcMain.handle('appearance:set', (_e, patch: Record<string, unknown>) => setAppearance(patch))
  ipcMain.handle('library:pickRoot', async () => {
    const r = await dialog.showOpenDialog(parent()!, {
      title: '选择新的图库位置',
      properties: ['openDirectory', 'createDirectory']
    })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle('library:migrate', (_e, root: string) => migrateLibrary(root))
}
