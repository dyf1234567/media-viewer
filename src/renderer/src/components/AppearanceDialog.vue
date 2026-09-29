<script setup lang="ts">
import { reactive, watch } from 'vue'
import type { Appearance } from '@sh/types'
import { useUiStore } from '../stores/ui'
import { useSettingsStore } from '../stores/settings'
import Icon from './Icon.vue'

const ui = useUiStore()
const settings = useSettingsStore()

const UI_PRESETS: { key: Appearance['uiBg']; label: string; bg: string }[] = [
  { key: 'aurora', label: '渐变玻璃', bg: 'linear-gradient(135deg, #2b2350, #16324a 50%, #14403b)' },
  { key: 'midnight', label: '午夜蓝', bg: 'linear-gradient(135deg, #1d2440, #2a1f45)' },
  { key: 'graphite', label: '石墨', bg: 'linear-gradient(135deg, #232328, #151519)' },
  { key: 'basalt', label: '玄武', bg: 'linear-gradient(135deg, #26201c, #191512)' }
]

const VIEWER_PRESETS: { key: Appearance['viewerBg']; label: string; bg: string }[] = [
  { key: 'follow', label: '跟随界面背景', bg: 'linear-gradient(135deg, #101116 55%, #232328)' },
  { key: 'v-dark1', label: '深 · 一档', bg: '#111113' },
  { key: 'v-dark2', label: '深 · 二档', bg: '#232327' },
  { key: 'v-light1', label: '浅 · 一档', bg: '#e8e8ea' },
  { key: 'v-light2', label: '浅 · 二档', bg: '#cfced2' }
]

// 草稿(打开时从当前外观复制),改动即时应用到 DOM 供预览
const draft = reactive<Appearance>({ ...settings.appearance })

watch(
  () => ui.appearanceOpen,
  (open) => {
    if (open) Object.assign(draft, settings.appearance)
  }
)

watch(draft, () => settings.applyAppearance(draft), { deep: true })

function close(): void {
  // 取消:恢复为已保存的外观
  settings.applyAppearance()
  ui.appearanceOpen = false
}

async function save(): Promise<void> {
  await settings.saveAppearance({ ...draft })
  ui.appearanceOpen = false
}

async function resetDefault(): Promise<void> {
  Object.assign(draft, {
    uiTheme: 'dark',
    uiBg: 'aurora',
    uiBgCustom: '#1a1a2e',
    viewerBg: 'follow',
    viewerBgCustom: '#141414'
  })
}
</script>

<template>
  <div class="dlg-mask" @keydown.esc.stop="close" @mousedown.self="close">
    <div class="dlg" role="dialog" aria-modal="true" aria-label="外观与背景">
      <div class="dlg-head">外观与背景</div>
      <div class="dlg-body">
        <div class="sec-title">界面明暗</div>
        <div class="swatch-row">
          <button
            class="swatch"
            :class="{ active: draft.uiTheme === 'dark' }"
            :style="{ background: 'linear-gradient(135deg, #16171d, #2b2c35)' }"
            @click="draft.uiTheme = 'dark'"
          >
            深色
          </button>
          <button
            class="swatch"
            :class="{ active: draft.uiTheme === 'light' }"
            :style="{ background: 'linear-gradient(135deg, #dfe2e8, #f8fafd)' }"
            @click="draft.uiTheme = 'light'"
          >
            浅色
          </button>
        </div>
        <div class="sec-title" style="margin-top: 16px">界面背景</div>
        <div class="swatch-row">
          <button
            v-for="p in UI_PRESETS"
            :key="p.key"
            class="swatch"
            :class="{ active: draft.uiBg === p.key }"
            :style="{ background: p.bg }"
            @click="draft.uiBg = p.key"
          >
            {{ p.label }}
          </button>
          <button
            class="swatch custom"
            :class="{ active: draft.uiBg === 'custom' }"
            @click="draft.uiBg = 'custom'"
          >
            <input
              v-model="draft.uiBgCustom"
              type="color"
              title="自定义取色"
              @click.stop
            />
            自定义
          </button>
        </div>

        <div class="sec-title" style="margin-top: 16px">查看与对比背景</div>
        <p class="hint-line">预览器 / 对比界面的背景色,按明暗自动切换查看器配色。</p>
        <div class="swatch-row">
          <button
            v-for="p in VIEWER_PRESETS"
            :key="p.key"
            class="swatch"
            :class="{ active: draft.viewerBg === p.key }"
            :style="{ background: p.bg }"
            @click="draft.viewerBg = p.key"
          >
            {{ p.label }}
          </button>
          <button
            class="swatch custom"
            :class="{ active: draft.viewerBg === 'custom' }"
            @click="draft.viewerBg = 'custom'"
          >
            <input
              v-model="draft.viewerBgCustom"
              type="color"
              title="自定义取色"
              @click.stop
            />
            自定义
          </button>
        </div>
      </div>
      <div class="dlg-foot">
        <button class="btn" @click="resetDefault">恢复默认</button>
        <div style="flex: 1" />
        <button class="btn" @click="close">取消</button>
        <button class="btn primary" @click="save">保存</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sec-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-dim);
  margin-bottom: 8px;
}
.hint-line {
  font-size: 11px;
  color: var(--text-faint);
  margin-bottom: 8px;
}
.swatch-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.swatch {
  width: 108px;
  height: 64px;
  border-radius: 10px;
  border: 2px solid var(--border-strong);
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.85);
  display: flex;
  align-items: flex-end;
  padding: 6px;
  position: relative;
  overflow: hidden;
}
.swatch:hover {
  border-color: rgba(255, 255, 255, 0.4);
}
.swatch.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.swatch.custom {
  background: var(--bg-glass-strong);
  flex-direction: row;
  align-items: center;
  gap: 7px;
  color: var(--text-dim);
}
.swatch.custom input {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  padding: 1px;
}
</style>
