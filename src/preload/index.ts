import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import type {
  Album,
  Appearance,
  Asset,
  AssetFull,
  BatchResult,
  DiffResult,
  ExportCompareType,
  HistogramData,
  ImportReport,
  PairScore,
  PlayInfo,
  QualityReport,
  Settings,
  Tag,
  VideoInfo,
  WindowState
} from '../shared/types'

export interface MvApi {
  win: {
    minimize(): Promise<void>
    maximizeToggle(): Promise<void>
    close(): Promise<void>
    pinToggle(): Promise<boolean>
    reload(): Promise<void>
    getState(): Promise<WindowState>
    onState(cb: (s: WindowState) => void): () => void
  }
  dialog: {
    pickFiles(): Promise<string[]>
    pickDirs(): Promise<string[]>
    pickFolder(): Promise<string | null>
    pathForFile(file: File): string
  }
  importer: {
    run(
      entries: { path: string; isDir: boolean }[],
      mode: 'reference' | 'managed'
    ): Promise<ImportReport>
    cancel(): Promise<void>
    onProgress(cb: (p: { done: number; total: number; label: string }) => void): () => void
  }
  assets: {
    list(): Promise<{ assets: Asset[]; tags: Tag[]; albums: Album[] }>
    get(id: number): Promise<AssetFull>
    update(id: number, patch: { rating?: number; favorite?: boolean; note?: string }): Promise<AssetFull>
    rename(id: number, name: string): Promise<string>
    toTrash(ids: number[]): Promise<BatchResult[]>
    restore(ids: number[]): Promise<BatchResult[]>
    deleteForever(ids: number[]): Promise<BatchResult[]>
    relocate(id: number): Promise<{ found: boolean; canceled: boolean }>
    convertToManaged(ids: number[]): Promise<{ ok: number; total: number; errors: string[] }>
    rebuildThumb(id: number): Promise<void>
    findSimilar(threshold: number): Promise<{ aId: number; bId: number; aName: string; bName: string; dist: number }[]>
    exportBatch(
      ids: number[],
      opts: { dir: string; mode: 'copy' | 'convert'; format?: 'png' | 'jpg' | 'webp'; quality?: number }
    ): Promise<{ ok: number; total: number; files: string[]; errors: string[] }>
  }
  tags: {
    create(name: string): Promise<Tag>
    assign(assetIds: number[], name: string): Promise<number>
    unassign(assetId: number, tagId: number): Promise<void>
  }
  albums: {
    create(name: string): Promise<Album>
    assign(assetIds: number[], albumId: number): Promise<void>
    unassign(assetId: number, albumId: number): Promise<void>
  }
  meta: {
    histogram(id: number, force?: boolean): Promise<HistogramData | null>
  }
  compare: {
    diff(aId: number, bId: number, forExport?: boolean): Promise<DiffResult>
    exportResult(args: {
      aId: number
      bId: number
      type: ExportCompareType
      wipePct: number
      flickerSide: 'a' | 'b'
    }): Promise<string | null>
    quality(refId: number, testId: number): Promise<QualityReport>
    vote(aId: number, bId: number, winnerIsA: boolean): Promise<PairScore>
    score(aId: number, bId: number): Promise<PairScore>
  }
  editor: {
    apply(args: {
      id: number
      crop?: { x: number; y: number; w: number; h: number }
      rotate?: number
      flipH?: boolean
      adjust?: { brightness: number; contrast: number; saturation: number }
    }): Promise<void>
    saveAs(id: number, format: 'png' | 'jpg' | 'webp' | 'bmp' | 'gif'): Promise<string | null>
  }
  video: {
    playInfo(id: number): Promise<PlayInfo>
    info(id: number): Promise<VideoInfo | null>
    playing(path: string, on: boolean): Promise<void>
  }
  settings: {
    get(): Promise<{ settings: Settings; appearance: Appearance; libraryRoot: string }>
    set(patch: Partial<Settings>): Promise<Settings>
    setAppearance(patch: Partial<Appearance>): Promise<Appearance>
    pickLibraryRoot(): Promise<string | null>
    migrateLibrary(root: string): Promise<void>
    onMigrateProgress(cb: (p: { phase: string; pct: number }) => void): () => void
  }
  app: {
    relaunch(): Promise<void>
    quit(): Promise<void>
  }
  onLibChanged(cb: (e: { upserted: Asset[]; removed: number[] }) => void): () => void
  onCollections(cb: () => void): () => void
}

/** 把 Vue 响应式代理转换为可结构化克隆的普通对象 */
function plain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v ?? null)) as T
}

const api: MvApi = {
  win: {
    minimize: () => ipcRenderer.invoke('win:minimize'),
    maximizeToggle: () => ipcRenderer.invoke('win:maximize'),
    close: () => ipcRenderer.invoke('win:close'),
    pinToggle: () => ipcRenderer.invoke('win:pin'),
    reload: () => ipcRenderer.invoke('win:reload'),
    getState: () => ipcRenderer.invoke('win:state:get'),
    onState(cb) {
      const fn = (_e: IpcRendererEvent, s: WindowState): void => cb(s)
      ipcRenderer.on('win:state', fn)
      return () => ipcRenderer.removeListener('win:state', fn)
    }
  },
  dialog: {
    pickFiles: () => ipcRenderer.invoke('dlg:pickFiles'),
    pickDirs: () => ipcRenderer.invoke('dlg:pickDirs'),
    pickFolder: () => ipcRenderer.invoke('dlg:pickFolder'),
    pathForFile: (file: File) => webUtils.getPathForFile(file)
  },
  importer: {
    run: (entries, mode) => ipcRenderer.invoke('import:run', { entries: plain(entries), mode }),
    cancel: () => ipcRenderer.invoke('import:cancel'),
    onProgress(cb) {
      const fn = (_e: IpcRendererEvent, p: { done: number; total: number; label: string }): void =>
        cb(p)
      ipcRenderer.on('import:progress', fn)
      return () => ipcRenderer.removeListener('import:progress', fn)
    }
  },
  assets: {
    list: () => ipcRenderer.invoke('assets:list'),
    get: (id) => ipcRenderer.invoke('assets:get', id),
    update: (id, patch) => ipcRenderer.invoke('assets:update', { id, patch: plain(patch) }),
    rename: (id, name) => ipcRenderer.invoke('assets:rename', { id, name }),
    toTrash: (ids) => ipcRenderer.invoke('assets:toTrash', plain(ids)),
    restore: (ids) => ipcRenderer.invoke('assets:restore', plain(ids)),
    deleteForever: (ids) => ipcRenderer.invoke('assets:deleteForever', plain(ids)),
    relocate: (id) => ipcRenderer.invoke('assets:relocate', id),
    convertToManaged: (ids) => ipcRenderer.invoke('assets:convertToManaged', plain(ids)),
    findSimilar: (threshold) => ipcRenderer.invoke('assets:findSimilar', threshold),
    exportBatch: (ids, opts) => ipcRenderer.invoke('assets:exportBatch', { ids: plain(ids), opts }),
    rebuildThumb: (id) => ipcRenderer.invoke('thumbs:rebuild', id)
  },
  tags: {
    create: (name) => ipcRenderer.invoke('tags:create', name),
    assign: (assetIds, name) => ipcRenderer.invoke('tags:assign', { assetIds: plain(assetIds), name }),
    unassign: (assetId, tagId) => ipcRenderer.invoke('tags:unassign', { assetId, tagId })
  },
  albums: {
    create: (name) => ipcRenderer.invoke('albums:create', name),
    assign: (assetIds, albumId) => ipcRenderer.invoke('albums:assign', { assetIds: plain(assetIds), albumId }),
    unassign: (assetId, albumId) => ipcRenderer.invoke('albums:unassign', { assetId, albumId })
  },
  meta: {
    histogram: (id, force) => ipcRenderer.invoke('meta:histogram', { id, force })
  },
  compare: {
    diff: (aId, bId, forExport) => ipcRenderer.invoke('compare:diff', { aId, bId, forExport }),
    exportResult: (args) => ipcRenderer.invoke('compare:export', plain(args)),
    quality: (refId, testId) => ipcRenderer.invoke('compare:quality', { refId, testId }),
    vote: (aId, bId, winnerIsA) => ipcRenderer.invoke('compare:vote', { aId, bId, winnerIsA }),
    score: (aId, bId) => ipcRenderer.invoke('compare:score', { aId, bId })
  },
  editor: {
    apply: (args) => ipcRenderer.invoke('editor:apply', plain(args)),
    saveAs: (id, format) => ipcRenderer.invoke('editor:saveAs', { id, format })
  },
  video: {
    playInfo: (id) => ipcRenderer.invoke('video:playInfo', id),
    info: (id) => ipcRenderer.invoke('video:info', id),
    playing: (path, on) => ipcRenderer.invoke('video:playing', { path, on })
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', plain(patch)),
    setAppearance: (patch) => ipcRenderer.invoke('appearance:set', plain(patch)),
    pickLibraryRoot: () => ipcRenderer.invoke('library:pickRoot'),
    migrateLibrary: (root) => ipcRenderer.invoke('library:migrate', root),
    onMigrateProgress(cb) {
      const fn = (_e: IpcRendererEvent, p: { phase: string; pct: number }): void => cb(p)
      ipcRenderer.on('migrate:progress', fn)
      return () => ipcRenderer.removeListener('migrate:progress', fn)
    }
  },
  app: {
    relaunch: () => ipcRenderer.invoke('app:relaunch'),
    quit: () => ipcRenderer.invoke('app:quit')
  },
  onLibChanged(cb) {
    const fn = (_e: IpcRendererEvent, e: { upserted: Asset[]; removed: number[] }): void => cb(e)
    ipcRenderer.on('lib:changed', fn)
    return () => ipcRenderer.removeListener('lib:changed', fn)
  },
  onCollections(cb) {
    const fn = (): void => cb()
    ipcRenderer.on('lib:collections', fn)
    return () => ipcRenderer.removeListener('lib:collections', fn)
  }
}

contextBridge.exposeInMainWorld('mv', api)
