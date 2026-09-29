import { defineStore } from 'pinia'
import type { Appearance, Settings } from '@sh/types'

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    loaded: false,
    settings: {
      retentionDays: 30,
      thumbCacheMB: 512,
      videoCacheMB: 2048
    } as Settings,
    appearance: {
      uiTheme: 'dark',
      uiBg: 'aurora',
      uiBgCustom: '#1a1a2e',
      viewerBg: 'follow',
      viewerBgCustom: '#141414'
    } as Appearance,
    libraryRoot: ''
  }),

  actions: {
    async load(): Promise<void> {
      const r = await window.mv.settings.get()
      this.settings = r.settings
      this.appearance = r.appearance
      this.libraryRoot = r.libraryRoot
      this.loaded = true
      this.applyAppearance()
    },
    /** 应用外观到 DOM(可传入临时值用于实时预览) */
    applyAppearance(app?: Appearance): void {
      const a = app ?? this.appearance
      document.documentElement.dataset.uiTheme = a.uiTheme
      if (a.uiBg === 'custom') {
        document.body.dataset.uiBg = 'custom'
        document.body.style.setProperty('--bg', a.uiBgCustom)
        document.body.style.setProperty('--ui-bg-image', 'none')
      } else {
        document.body.dataset.uiBg = a.uiBg
        document.body.style.removeProperty('--bg')
        document.body.style.removeProperty('--ui-bg-image')
      }
      // 查看器背景与明暗配色
      const map: Record<string, string> = {
        'v-dark1': '#111113',
        'v-dark2': '#232327',
        'v-light1': '#e8e8ea',
        'v-light2': '#cfced2'
      }
      let color: string
      if (a.viewerBg === 'follow') {
        // 跟随界面背景:与当前界面底色保持零色差(随明暗主题切换)
        if (a.uiBg === 'custom') color = a.uiBgCustom
        else color = a.uiTheme === 'light' ? '#eef0f4' : '#101116'
      } else if (a.viewerBg === 'custom') {
        color = a.viewerBgCustom
      } else {
        color = map[a.viewerBg] ?? '#111113'
      }
      document.documentElement.style.setProperty('--viewer-bg', color)
      const lum = luminance(color)
      document.documentElement.dataset.viewerTheme = lum > 0.5 ? 'light' : 'dark'
    },
    async saveSettings(patch: Partial<Settings>): Promise<void> {
      this.settings = await window.mv.settings.set(patch)
    },
    async saveAppearance(patch: Partial<Appearance>): Promise<void> {
      this.appearance = await window.mv.settings.setAppearance(patch)
      this.applyAppearance()
    }
  }
})

function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return 0
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}
