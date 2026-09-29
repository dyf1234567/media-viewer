import { defineStore } from 'pinia'
import { reactive, watch } from 'vue'

export type PageName = 'library' | 'tags'
export type ScopeType =
  | 'all'
  | 'favorites'
  | 'unclassified'
  | 'untagged'
  | 'trash'
  | 'album'
  | 'random'

export interface Filters {
  formats: string[]
  shape: '' | 'h' | 'v' | 'sq'
  tags: number[]
  albums: number[]
  colors: string[]
  rating: -1 | 0 | 1 | 2 | 3 | 4 | 5 // -1 未启用, 0 尚未评分
  dateAdded: number // 0 未启用, 否则天数
  dateModified: number
  note: '' | 'yes' | 'no'
  dimension: '' | '4k' | '1080' | '720' | 'small'
  size: '' | '>10mb' | '>1mb' | '>100kb' | '<100kb' | '<1mb'
}

export type SortKey = 'imported' | 'name-asc' | 'name-desc' | 'size-desc' | 'rating-desc' | 'modified'
export type ViewMode = 'waterfall' | 'list'

interface PreviewState {
  open: boolean
  assetId: number | null
}
interface EditorState {
  open: boolean
  assetId: number | null
}

const PERSIST_KEYS = ['viewMode', 'sortKey', 'thumbSize', 'sidebarCollapsed', 'panelCollapsed'] as const

function loadPersisted(): Partial<UiState> {
  try {
    return JSON.parse(localStorage.getItem('mv.ui') ?? '{}')
  } catch {
    return {}
  }
}

interface UiState {
  page: PageName
  scope: ScopeType
  scopeAlbumId: number | null
  randomIds: number[] | null
  viewMode: ViewMode
  sortKey: SortKey
  thumbSize: number
  search: string
  filters: Filters
  sidebarCollapsed: boolean
  panelCollapsed: boolean
  compact: boolean
  autoSidebar: boolean
  autoPanel: boolean
  selection: number[]
  anchorId: number | null
  preview: PreviewState
  editor: EditorState
  settingsOpen: boolean
  appearanceOpen: boolean
  compareOpen: boolean
  /** ? / F1 打开的快捷键速查面板 */
  shortcutHelpOpen: boolean
  /** 相似图片查重对话框 */
  similarOpen: boolean
  /** 筛选面板展开(漏斗按钮;激活条件的 chips 始终显示,与此独立) */
  filterPanelOpen: boolean
  /** Delete 键触发的删除确认:'trash' 移入回收站 / 'system' 删除到系统回收站 */
  deleteConfirm: null | 'trash' | 'system'
  detailsAssetId: number | null
}

export const useUiStore = defineStore('ui', {
  state: (): UiState => ({
    page: 'library',
    scope: 'all',
    scopeAlbumId: null,
    randomIds: null,
    viewMode: 'waterfall',
    sortKey: 'imported',
    thumbSize: 220,
    search: '',
    filters: reactive({
      formats: [],
      shape: '',
      tags: [],
      albums: [],
      colors: [],
      rating: -1,
      dateAdded: 0,
      dateModified: 0,
      note: '',
      dimension: '',
      size: ''
    }),
    sidebarCollapsed: false,
    panelCollapsed: false,
    compact: false,
    autoSidebar: false,
    autoPanel: false,
    selection: [],
    anchorId: null,
    preview: { open: false, assetId: null },
    editor: { open: false, assetId: null },
    settingsOpen: false,
    appearanceOpen: false,
    compareOpen: false,
    shortcutHelpOpen: false,
    similarOpen: false,
    filterPanelOpen: false,
    deleteConfirm: null,
    detailsAssetId: null,
    ...loadPersisted()
  }),

  getters: {
    /** 当前是否在回收站 */
    isTrash(state): boolean {
      return state.scope === 'trash'
    },
    /** 是否随机浏览模式(排序禁用) */
    isRandom(state): boolean {
      return state.scope === 'random'
    },
    /** 详情面板当前素材 */
    detailsId(state): number | null {
      return state.detailsAssetId
    }
  },

  actions: {
    setScope(scope: ScopeType, albumId?: number): void {
      this.scope = scope
      this.scopeAlbumId = albumId ?? null
      this.selection = []
      this.anchorId = null
      this.randomIds = scope === 'random' ? this.randomIds : null
      this.detailsAssetId = null
    },
    startRandom(ids: number[]): void {
      this.randomIds = ids
      this.scope = 'random'
      this.selection = []
      this.detailsAssetId = null
    },
    select(id: number, mode: 'replace' | 'toggle' | 'range', orderedIds: number[] = []): void {
      if (mode === 'replace') {
        this.selection = [id]
        this.anchorId = id
      } else if (mode === 'toggle') {
        const i = this.selection.indexOf(id)
        if (i >= 0) this.selection.splice(i, 1)
        else this.selection.push(id)
        this.anchorId = id
      } else {
        const anchor = this.anchorId ?? id
        const ai = orderedIds.indexOf(anchor)
        const bi = orderedIds.indexOf(id)
        if (ai < 0 || bi < 0) {
          this.selection = [id]
          this.anchorId = id
          return
        }
        const [lo, hi] = ai < bi ? [ai, bi] : [bi, ai]
        const range = orderedIds.slice(lo, hi + 1)
        // 追加而不是替换(Ctrl+Shift 行为)
        const set = new Set(this.selection)
        for (const r of range) set.add(r)
        this.selection = [...set]
      }
    },
    clearSelection(): void {
      this.selection = []
      this.anchorId = null
    },
    openPreview(id: number): void {
      this.preview = { open: true, assetId: id }
    },
    closePreview(): void {
      this.preview = { open: false, assetId: null }
    },
    openEditor(id: number): void {
      this.editor = { open: true, assetId: id }
    },
    closeEditor(): void {
      this.editor = { open: false, assetId: null }
    },
    clearFilters(): void {
      const f = this.filters
      f.formats = []
      f.shape = ''
      f.tags = []
      f.albums = []
      f.colors = []
      f.rating = -1
      f.dateAdded = 0
      f.dateModified = 0
      f.note = ''
      f.dimension = ''
      f.size = ''
      this.search = ''
    }
  }
})

// 视图模式、排序、缩略图大小、折叠状态在重启后保留(pinia 就绪后调用)
export function setupUiPersistence(): void {
  const s = useUiStore()
  watch(
    () => ({
      viewMode: s.viewMode,
      sortKey: s.sortKey,
      thumbSize: s.thumbSize,
      sidebarCollapsed: s.sidebarCollapsed,
      panelCollapsed: s.panelCollapsed
    }),
    (v) => localStorage.setItem('mv.ui', JSON.stringify(v)),
    { deep: true }
  )
}
