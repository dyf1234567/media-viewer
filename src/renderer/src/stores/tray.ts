import { defineStore } from 'pinia'
import { useLibraryStore } from './library'
import { useToastStore } from './toast'

export const TRAY_MAX = 9

/** 对比托盘:攒入 2–9 个同类型素材后打开对比工作台(工作台在下一阶段提供) */
export const useTrayStore = defineStore('tray', {
  state: () => ({
    ids: [] as number[]
  }),

  getters: {
    count(state): number {
      return state.ids.length
    },
    kinds(state): ('image' | 'video')[] {
      const lib = useLibraryStore()
      const set = new Set<'image' | 'video'>()
      for (const id of state.ids) {
        const a = lib.byId.get(id)
        if (a) set.add(a.kind)
      }
      return [...set]
    },
    mixed(): boolean {
      return this.kinds.length > 1
    },
    canOpen(state): boolean {
      return state.ids.length >= 2 && !this.mixed && state.ids.length <= TRAY_MAX
    },
    blockedReason(state): string {
      if (this.mixed) return '图片与视频不能混选对比'
      if (state.ids.length < 2) return `至少需要 2 个素材(当前 ${state.ids.length})`
      if (state.ids.length > TRAY_MAX) return `最多 ${TRAY_MAX} 个素材`
      return ''
    }
  },

  actions: {
    add(ids: number[]): { ok: boolean; msg?: string } {
      const lib = useLibraryStore()
      const tray = useToastStore()
      for (const id of ids) {
        if (this.ids.includes(id)) continue
        const a = lib.byId.get(id)
        if (!a) continue
        const newKinds = new Set([...this.kinds, a.kind])
        if (newKinds.size > 1) {
          return { ok: false, msg: '图片与视频不能混选对比' }
        }
        if (this.ids.length >= TRAY_MAX) {
          tray.error(`对比托盘最多 ${TRAY_MAX} 个素材`)
          return { ok: false }
        }
        this.ids.push(id)
      }
      return { ok: true }
    },
    remove(id: number): void {
      this.ids = this.ids.filter((i) => i !== id)
    },
    clear(): void {
      this.ids = []
    }
  }
})
