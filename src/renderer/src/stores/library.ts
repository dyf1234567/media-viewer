import { defineStore } from 'pinia'
import type { Album, Asset, Tag } from '@sh/types'

/** 图库数据镜像:主进程为唯一数据源,通过事件增量同步 */
export const useLibraryStore = defineStore('library', {
  state: () => ({
    loaded: false,
    assets: [] as Asset[],
    byId: new Map<number, Asset>(),
    tags: [] as Tag[],
    albums: [] as Album[],
    /** 导入进行中 */
    importing: false
  }),

  getters: {
    activeAssets(state): Asset[] {
      return state.assets.filter((a) => a.deletedAt === null)
    },
    trashedAssets(state): Asset[] {
      return state.assets.filter((a) => a.deletedAt !== null)
    },
    favoritesCount(): number {
      return (this.activeAssets as Asset[]).filter((a) => a.favorite).length
    },
    unclassifiedCount(): number {
      return (this.activeAssets as Asset[]).filter((a) => a.albumIds.length === 0).length
    },
    untaggedCount(): number {
      return (this.activeAssets as Asset[]).filter((a) => a.tagIds.length === 0).length
    },
    trashCount(): number {
      return this.trashedAssets.length
    },
    allCount(): number {
      return this.activeAssets.length
    }
  },

  actions: {
    async load(): Promise<void> {
      const { assets, tags, albums } = await window.mv.assets.list()
      this.assets = assets
      this.rebuildIndex()
      this.tags = tags
      this.albums = albums
      this.loaded = true
      this.bindEvents()
    },
    rebuildIndex(): void {
      this.byId = new Map(this.assets.map((a) => [a.id, a]))
    },
    applyChange(e: { upserted: Asset[]; removed: number[] }): void {
      const removed = new Set(e.removed)
      if (removed.size) {
        this.assets = this.assets.filter((a) => !removed.has(a.id))
      }
      if (e.upserted.length) {
        const upserts = new Map(e.upserted.map((a) => [a.id, a]))
        const seen = new Set<number>()
        this.assets = this.assets.map((a) => {
          if (upserts.has(a.id)) {
            seen.add(a.id)
            return upserts.get(a.id)!
          }
          return a
        })
        for (const a of e.upserted) {
          if (!seen.has(a.id)) this.assets.push(a)
        }
        this.rebuildIndex()
      } else if (removed.size) {
        this.rebuildIndex()
      }
    },
    async refreshCollections(): Promise<void> {
      const { tags, albums } = await window.mv.assets.list()
      this.tags = tags
      this.albums = albums
    },
    patchLocal(id: number, patch: Partial<Asset>): void {
      const a = this.byId.get(id)
      if (!a) return
      Object.assign(a, patch)
    },
    bindEvents(): void {
      window.mv.onLibChanged((e) => this.applyChange(e))
      window.mv.onCollections(() => {
        void this.refreshCollections()
      })
    }
  }
})
