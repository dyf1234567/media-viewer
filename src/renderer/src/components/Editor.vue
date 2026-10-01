<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useUiStore } from '../stores/ui'
import { useLibraryStore } from '../stores/library'
import { useToastStore } from '../stores/toast'
import { sourceUrl } from '../util/format'
import Icon from './Icon.vue'
import CropOverlay from './CropOverlay.vue'

const ui = useUiStore()
const lib = useLibraryStore()
const toast = useToastStore()

const asset = computed(() => (ui.editor.assetId != null ? lib.byId.get(ui.editor.assetId) ?? null : null))

const adjust = reactive({ brightness: 0, contrast: 0, saturation: 0 })
const rotate = ref(0)
const cropRect = ref<{ x: number; y: number; w: number; h: number } | null>(null)
const cropping = ref(false)
const busy = ref(false)
const tab = ref<'adjust' | 'crop'>('adjust')
const stageEl = ref<HTMLElement | null>(null)
const natural = reactive({ w: 0, h: 0 })

watch(
  () => ui.editor.assetId,
  () => resetAll()
)

function resetAll(): void {
  adjust.brightness = 0
  adjust.contrast = 0
  adjust.saturation = 0
  rotate.value = 0
  cropRect.value = null
  cropping.value = false
  tab.value = 'adjust'
}

function resetSliders(): void {
  adjust.brightness = 0
  adjust.contrast = 0
  adjust.saturation = 0
}

/** 实时预览:CSS filter + 旋转 */
const previewStyle = computed(() => {
  const b = 1 + adjust.brightness / 100
  const c = 1 + adjust.contrast / 100
  const s = 1 + adjust.saturation / 100
  return {
    filter: `brightness(${b}) contrast(${c}) saturate(${s})`,
    transform: `rotate(${rotate.value}deg)`
  }
})

function rotateBy(deg: number): void {
  rotate.value = (rotate.value + deg + 360) % 360
}

async function apply(): Promise<void> {
  if (!asset.value || busy.value) return
  const hasAdjust = adjust.brightness !== 0 || adjust.contrast !== 0 || adjust.saturation !== 0
  if (!hasAdjust && !rotate.value && !cropRect.value) {
    ui.closeEditor()
    return
  }
  busy.value = true
  try {
    await window.mv.editor.apply({
      id: asset.value.id,
      rotate: rotate.value || undefined,
      crop: cropRect.value ?? undefined,
      adjust: hasAdjust ? { ...adjust } : undefined
    })
    toast.success('已保存到原文件')
    resetAll()
    ui.closeEditor()
  } catch (e) {
    toast.error((e as Error).message)
  } finally {
    busy.value = false
  }
}

const FORMATS: { key: 'png' | 'jpg' | 'webp' | 'bmp' | 'gif'; label: string }[] = [
  { key: 'png', label: 'PNG' },
  { key: 'jpg', label: 'JPG' },
  { key: 'webp', label: 'WEBP' },
  { key: 'bmp', label: 'BMP' },
  { key: 'gif', label: 'GIF' }
]

async function saveAs(format: 'png' | 'jpg' | 'webp' | 'bmp' | 'gif'): Promise<void> {
  if (!asset.value || busy.value) return
  busy.value = true
  try {
    // 导出包含当前预览效果
    const hasAdjust = adjust.brightness !== 0 || adjust.contrast !== 0 || adjust.saturation !== 0
    if (hasAdjust || rotate.value || cropRect.value) {
      await window.mv.editor.apply({
        id: asset.value.id,
        rotate: rotate.value || undefined,
        crop: cropRect.value ?? undefined,
        adjust: hasAdjust ? { ...adjust } : undefined
      })
      resetAll()
    }
    const saved = await window.mv.editor.saveAs(asset.value.id, format)
    if (saved) toast.success(`已导出 ${saved}`)
  } catch (e) {
    toast.error((e as Error).message)
  } finally {
    busy.value = false
  }
}

function onCropDone(rect: { x: number; y: number; w: number; h: number } | null): void {
  cropping.value = false
  if (rect) cropRect.value = rect
}

function onImgLoad(e: Event): void {
  const img = e.target as HTMLImageElement
  natural.w = img.naturalWidth
  natural.h = img.naturalHeight
}

function close(): void {
  ui.closeEditor()
}
</script>

<template>
  <div v-if="asset" class="editor-overlay">
    <div class="ed-stage-wrap">
      <div ref="stageEl" class="ed-stage">
        <img
          :src="sourceUrl(asset)"
          class="ed-img"
          :style="previewStyle"
          draggable="false"
          alt=""
          @load="onImgLoad"
        />
        <!-- 裁切预览遮罩 -->
        <div
          v-if="cropRect"
          class="crop-preview"
          :style="{
            left: `${(cropRect.x / natural.w) * 100}%`,
            top: `${(cropRect.y / natural.h) * 100}%`,
            width: `${(cropRect.w / natural.w) * 100}%`,
            height: `${(cropRect.h / natural.h) * 100}%`
          }"
        />
        <CropOverlay
          v-if="cropping"
          :stage-width="stageEl?.clientWidth ?? 800"
          :stage-height="stageEl?.clientHeight ?? 600"
          :natural-width="natural.w"
          :natural-height="natural.h"
          :scale="Math.min((stageEl?.clientWidth ?? 800) / natural.w, (stageEl?.clientHeight ?? 600) / natural.h, 1)"
          :offset-x="0"
          :offset-y="0"
          @done="onCropDone"
        />
      </div>
    </div>

    <!-- 右侧控制面板 -->
    <div class="ed-panel">
      <div class="ed-head">
        <span class="ed-title">图片编辑</span>
        <span class="ed-file" :title="asset.fileName">{{ asset.fileName }}</span>
        <button class="pb-close" title="关闭" @click="close">
          <Icon name="x" :size="15" />
        </button>
      </div>

      <div class="ed-tabs">
        <button class="ed-tab" :class="{ active: tab === 'adjust' }" @click="tab = 'adjust'; cropping = false">调节</button>
        <button class="ed-tab" :class="{ active: tab === 'crop' }" @click="tab = 'crop'">裁剪</button>
      </div>

      <div class="ed-body">
        <template v-if="tab === 'adjust'">
          <div class="slider-row">
            <label>亮度</label>
            <input v-model.number="adjust.brightness" type="range" min="-100" max="100" step="1" />
            <span class="slider-val">{{ adjust.brightness > 0 ? '+' : '' }}{{ adjust.brightness }}</span>
          </div>
          <div class="slider-row">
            <label>对比度</label>
            <input v-model.number="adjust.contrast" type="range" min="-100" max="100" step="1" />
            <span class="slider-val">{{ adjust.contrast > 0 ? '+' : '' }}{{ adjust.contrast }}</span>
          </div>
          <div class="slider-row">
            <label>饱和度</label>
            <input v-model.number="adjust.saturation" type="range" min="-100" max="100" step="1" />
            <span class="slider-val">{{ adjust.saturation > 0 ? '+' : '' }}{{ adjust.saturation }}</span>
          </div>
          <p class="ed-hint">拖动滑杆实时预览,「应用并保存」后写入原文件并同步记录。</p>
        </template>
        <template v-else>
          <button class="btn" @click="cropping = true">
            <Icon name="crop" :size="14" />
            {{ cropRect ? '重新框选' : '开始框选' }}
          </button>
          <div v-if="cropRect" class="crop-info">
            选区: {{ cropRect.w }} × {{ cropRect.h }} px
            <button class="btn sm" @click="cropRect = null">清除选区</button>
          </div>
        </template>

        <div class="ed-sep" />

        <div class="rotate-row">
          <span class="row-label">旋转</span>
          <button class="btn sm" title="左旋 90°" @click="rotateBy(-90)">
            <Icon name="rotate-l" :size="13" />
          </button>
          <button class="btn sm" title="右旋 90°" @click="rotateBy(90)">
            <Icon name="rotate-r" :size="13" />
          </button>
          <span class="rotate-deg">{{ rotate }}°</span>
        </div>

        <div class="ed-sep" />

        <div class="saveas-row">
          <span class="row-label">另存为</span>
          <button
            v-for="f in FORMATS"
            :key="f.key"
            class="fmt-btn"
            :disabled="busy"
            :title="f.key === 'jpg' ? '透明区域自动合成白底' : `导出 ${f.label} 副本,不改动原图`"
            @click="saveAs(f.key)"
          >
            {{ f.label }}
          </button>
        </div>
      </div>

      <div class="ed-foot">
        <button class="btn" :disabled="busy" @click="resetSliders(); rotate = 0; cropRect = null">重置</button>
        <div class="spacer" />
        <button class="btn" :disabled="busy" @click="close">取消</button>
        <button class="btn primary" :disabled="busy" @click="apply">
          <Icon name="save" :size="13" />
          {{ busy ? '处理中…' : '应用并保存' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor-overlay {
  position: fixed;
  inset: 0;
  z-index: 800;
  background: var(--bg);
  display: flex;
}
.ed-stage-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  overflow: hidden;
}
.ed-stage {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  max-width: 100%;
  max-height: 100%;
}
.ed-img {
  max-width: 100%;
  max-height: calc(100vh - 48px);
  object-fit: contain;
  user-select: none;
  transition: filter 0.06s linear;
}
.crop-preview {
  position: absolute;
  border: 1px dashed rgba(79, 124, 255, 0.9);
  background: rgba(79, 124, 255, 0.08);
  pointer-events: none;
}
.ed-panel {
  width: 300px;
  flex: none;
  background: var(--panel);
  border-left: 1px solid var(--border-strong);
  display: flex;
  flex-direction: column;
}
.ed-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 14px 10px;
}
.ed-title {
  font-size: 14px;
  font-weight: 600;
  flex: none;
}
.ed-file {
  flex: 1;
  min-width: 0;
  font-size: 11.5px;
  color: var(--text-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pb-close {
  display: flex;
  padding: 5px;
  border-radius: 7px;
  color: var(--text-dim);
}
.pb-close:hover {
  background: var(--bg-glass-strong);
  color: var(--text);
}
.ed-tabs {
  display: flex;
  gap: 4px;
  padding: 0 14px;
}
.ed-tab {
  flex: 1;
  padding: 8px;
  border-radius: 8px;
  background: var(--bg-glass);
  color: var(--text-dim);
  font-size: 12.5px;
}
.ed-tab.active {
  background: var(--accent-soft);
  color: var(--accent);
}
.ed-body {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.slider-row {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.slider-row label {
  font-size: 12px;
  color: var(--text-dim);
}
.slider-row input {
  width: 100%;
}
.slider-val {
  font-size: 11.5px;
  color: var(--text-faint);
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.ed-hint {
  font-size: 11px;
  color: var(--text-faint);
  line-height: 1.6;
}
.ed-sep {
  height: 1px;
  background: var(--border);
}
.rotate-row,
.saveas-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.row-label {
  font-size: 12px;
  color: var(--text-dim);
  flex: none;
  width: 46px;
}
.rotate-deg {
  font-size: 12px;
  color: var(--text-faint);
  margin-left: auto;
}
.fmt-btn {
  padding: 6px 10px;
  border-radius: 7px;
  background: var(--bg-glass);
  border: 1px solid var(--border);
  font-size: 11.5px;
  color: var(--text-dim);
}
.fmt-btn:hover:not(:disabled) {
  border-color: var(--border-strong);
  color: var(--text);
}
.crop-info {
  font-size: 12px;
  color: var(--text-dim);
  display: flex;
  align-items: center;
  gap: 10px;
}
.ed-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-top: 1px solid var(--border);
}
.spacer {
  flex: 1;
}
</style>
