?<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useUiStore } from '../stores/ui'
import { useLibraryStore } from '../stores/library'
import { useToastStore } from '../stores/toast'
import { scopeFilter, applyFilters, applySort } from '../util/pipeline'
import { sourceUrl, thumbUrl } from '../util/format'
import Icon from './Icon.vue'
import VideoPlayer from './VideoPlayer.vue'
import CropOverlay from './CropOverlay.vue'

const ui = useUiStore()
const lib = useLibraryStore()
const toast = useToastStore()

const playlist = computed(() => {
  const scoped = scopeFilter(lib.assets, ui.scope, ui.scopeAlbumId, ui.randomIds)
  const filtered = applyFilters(scoped, ui.filters, ui.search)
  return applySort(filtered, ui.sortKey, ui.isRandom)
})

const index = computed(() => {
  if (ui.preview.assetId == null) return -1
  const i = playlist.value.findIndex((a) => a.id === ui.preview.assetId)
  return i >= 0 ? i : 0
})
const asset = computed(() => playlist.value[index.value] ?? null)

// ---------- 缩放平移 ----------
const view = reactive({ scale: 1, tx: 0, ty: 0 })
const imgLoaded = ref(false)
const stageEl = ref<HTMLElement | null>(null)
const fullscreen = ref(false)
const saving = ref(false)
/** 适配基准:img 的 CSS 尺寸 = natural × baseScale,合成层纹理按显示尺寸栅格化(原图自然尺寸的层在大图上会数百毫秒重栅格,是拖动卡顿的根源) */
const baseScale = ref(1)
/** 真实宽高直接用库内记录(缩略图与原图同比例,加载前即可完成布局与适配) */
const natural = computed(() => ({ w: asset.value?.width ?? 0, h: asset.value?.height ?? 0 }))

function fitScaleOf(): number {
  const el = stageEl.value
  if (!el || !natural.w) return 1
  return Math.max(0.1, Math.min(el.clientWidth / natural.w, el.clientHeight / natural.h, 1))
}

function resetView(): void {
  view.scale = 1
  view.tx = 0
  view.ty = 0
  fitView()
}

function fitView(): void {
  const scale = fitScaleOf()
  baseScale.value = scale
  view.scale = scale
  view.tx = 0
  view.ty = 0
}

function clampScale(s: number): number {
  return Math.max(0.1, Math.min(10, s))
}

function zoomAt(clientX: number, clientY: number, factor: number): void {
  const el = stageEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const cx = clientX - rect.left - rect.width / 2
  const cy = clientY - rect.top - rect.height / 2
  const old = view.scale
  const next = clampScale(old * factor)
  // 以光标位置为锚点
  view.tx = cx - ((cx - view.tx) * next) / old
  view.ty = cy - ((cy - view.ty) * next) / old
  view.scale = next
}

function stepZoom(factor: number): void {
  const el = stageEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor)
}

function onWheel(e: WheelEvent): void {
  e.preventDefault()
  // 高回报率鼠标的滚轮事件一次会涌入多个,按帧合并后每帧只缩放一次
  if (wheelPending) {
    wheelPending.factor *= e.deltaY < 0 ? 1.12 : 1 / 1.12
    return
  }
  wheelPending = { x: e.clientX, y: e.clientY, factor: e.deltaY < 0 ? 1.12 : 1 / 1.12 }
  requestAnimationFrame(() => {
    const p = wheelPending
    wheelPending = null
    if (p) zoomAt(p.x, p.y, p.factor)
  })
}

// 拖拽平移
let panning = false
let panStart = { x: 0, y: 0, tx: 0, ty: 0 }
/** 滚轮缩放按帧合并的暂存 */
let wheelPending: { x: number; y: number; factor: number } | null = null
function panDown(e: MouseEvent): void {
  if (e.button !== 0 || cropping.value) return
  panning = true
  panStart = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty }
  window.addEventListener('mousemove', panMove)
  window.addEventListener('mouseup', panUp)
}
function panMove(e: MouseEvent): void {
  if (!panning) return
  view.tx = panStart.tx + (e.clientX - panStart.x)
  view.ty = panStart.ty + (e.clientY - panStart.y)
}
function panUp(): void {
  panning = false
  window.removeEventListener('mousemove', panMove)
  window.removeEventListener('mouseup', panUp)
}

const transformStyle = computed(() => {
  const base = baseScale.value > 0 ? baseScale.value : 1
  return {
    width: Math.round(natural.w * base) + 'px',
    height: Math.round(natural.h * base) + 'px',
    transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale / base})`
  }
})

function onImgLoad(): void {
  // 缩略图与原图各触发一次;尺寸与适配都来自库内记录,这里只需点亮显示
  imgLoaded.value = true
}

watch(
  () => ui.preview.assetId,
  () => {
    imgLoaded.value = false
    cropping.value = false
    // 库内尺寸即时可用,挂载后立即适配;缩略图秒开,原图到后无缝替换
    nextTick(() => fitView())
  }
)

// ---------- 切换 ----------
function step(delta: number): void {
  if (saving.value) return
  const list = playlist.value
  if (!list.length) return
  const next = (index.value + delta + list.length) % list.length
  ui.preview.assetId = list[next].id
  ui.detailsAssetId = list[next].id
  resetSlideTimer()
}

// ---------- 幻灯片轮播?----------
const SLIDE_MS = 3000
const slideshow = ref(false)
let slideTimer: ReturnType<typeof setInterval> | null = null

function resetSlideTimer(): void {
  if (!slideTimer) return
  clearInterval(slideTimer)
  slideTimer = setInterval(() => step(1), SLIDE_MS)
}

function toggleSlideshow(): void {
  slideshow.value = !slideshow.value
  if (slideshow.value) {
    slideTimer = setInterval(() => step(1), SLIDE_MS)
  } else if (slideTimer) {
    clearInterval(slideTimer)
    slideTimer = null
  }
}

// ---------- 变换写盘 ----------
async function applyTransform(args: { rotate?: number; flipH?: boolean }): Promise<void> {
  if (!asset.value || saving.value) return
  if (asset.value.missing) {
    toast.error('文件缺失,无法保存')
    return
  }
  saving.value = true
  try {
    await window.mv.editor.apply({ id: asset.value.id, ...args })
    // 记录已由事件同步刷新;重新加载图片
    imgLoaded.value = false
  } catch (e) {
    toast.error((e as Error).message)
  } finally {
    saving.value = false
  }
}

// ---------- 裁切 ----------
const cropping = ref(false)
function cropDone(rect: { x: number; y: number; w: number; h: number } | null): void {
  cropping.value = false
  if (!rect || !asset.value) return
  void doCrop(rect)
}
async function doCrop(rect: { x: number; y: number; w: number; h: number }): Promise<void> {
  saving.value = true
  try {
    await window.mv.editor.apply({ id: asset.value!.id, crop: rect })
    imgLoaded.value = false
    resetView()
  } catch (e) {
    toast.error((e as Error).message)
  } finally {
    saving.value = false
  }
}

function toggleFullscreen(): void {
  const el = document.documentElement
  if (!document.fullscreenElement) void el.requestFullscreen()
  else void document.exitFullscreen()
}

function close(): void {
  slideshow.value = false
  if (slideTimer) {
    clearInterval(slideTimer)
    slideTimer = null
  }
  ui.closePreview()
}

// ---------- 键盘 ----------
function onKeydown(e: KeyboardEvent): void {
  if (!ui.preview.open) return
  const target = e.target as HTMLElement
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
  if (cropping.value) {
    if (e.key === 'Escape') cropping.value = false
    return
  }
  switch (e.key) {
    case 'ArrowLeft':
      e.preventDefault()
      step(-1)
      break
    case 'ArrowRight':
      e.preventDefault()
      step(1)
      break
    case '+':
    case '=':
      e.preventDefault()
      stepZoom(1.2)
      break
    case '-':
    case '_':
      e.preventDefault()
      stepZoom(1 / 1.2)
      break
    case '0':
      e.preventDefault()
      resetView()
      break
    case 'r':
    case 'R':
      if (asset.value?.kind === 'image') void applyTransform({ rotate: 90 })
      break
    case 'f':
    case 'F':
      toggleFullscreen()
      break
    case 'Escape':
      if (document.fullscreenElement) void document.exitFullscreen()
      else close()
      break
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('wheel', onWheel, { passive: false })
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('wheel', onWheel)
  if (slideTimer) clearInterval(slideTimer)
})

const zoomPct = computed(() => Math.round(view.scale * 100))
/** 滑杆 0-100 对数映射到 0.1-10 倍 */
const zoomSlider = computed(() => Math.round((Math.log(view.scale / 0.1) / Math.log(100)) * 100))
function onSlider(e: Event): void {
  const v = Number((e.target as HTMLInputElement).value)
  view.scale = 0.1 * Math.pow(100, v / 100)
}
</script>

<template>
  <div
    v-if="asset"
    class="previewer"
    :class="{ cropping }"
    :style="{
      top: 'var(--titlebar-h)',
      right: ui.panelCollapsed ? '0' : 'var(--details-w, 0px)',
      left: ui.sidebarCollapsed ? '0' : 'var(--sidebar-w)'
    }"
  >
    <!-- 舞台 -->
    <div ref="stageEl" class="stage" @mousedown="panDown" @dblclick="fitView">
      <template v-if="asset.kind === 'image'">
        <!-- 缩略图立即显示,原图解码完成后无缝替换(Eagle 式打开即见);尺寸用库内真实宽高,不必等解码 -->
        <img
          v-show="imgLoaded && !asset.missing"
          :key="asset.id + '-' + asset.fileModifiedAt"
          :src="imgLoaded ? sourceUrl(asset) : thumbUrl(asset)"
          class="view-img"
          :style="transformStyle"
          draggable="false"
          alt=""
          @load="onImgLoad"
        />
        <div v-if="asset.missing" class="stage-center">
          <Icon name="warning" :size="34" />
          <p>文件缺失,请到详情面板「重新定位」找回</p>
        </div>
        <CropOverlay
          v-if="cropping"
          :stage-width="stageEl?.clientWidth ?? 800"
          :stage-height="stageEl?.clientHeight ?? 600"
          :natural-width="natural.w"
          :natural-height="natural.h"
          :scale="view.scale"
          :offset-x="view.tx"
          :offset-y="view.ty"
          @done="cropDone"
        />
      </template>
      <VideoPlayer v-else :key="asset.id" :asset="asset" />
    </div>

    <!-- 顶部工具栏(Eagle 式:返回 | 页码 | 缩放滑杆 | 动作 | 翻页);右侧详情面板保持可见 -->
    <div class="top-bar viewer-toolbar" :class="{ disabled: saving }">
      <!-- 返回:带描边胶囊样式,与翻页箭头明确区分 -->
      <button class="pb-btn pb-back" title="返回(Esc)" :disabled="saving" @click="close">
        <Icon name="arrow-left" :size="15" />
        <span class="pb-back-label">返回</span>
      </button>
      <span v-if="playlist.length" class="pv-page">{{ index + 1 }} / {{ playlist.length }}</span>
      <template v-if="asset.kind === 'image'">
        <input
          class="zoom-slider"
          type="range"
          min="0"
          max="100"
          step="1"
          :value="zoomSlider"
          title="缩放"
          @input="onSlider"
        />
        <span class="zoom-pct" title="缩放比例">{{ zoomPct }}%</span>
      </template>
      <span class="tb-flex" />
      <template v-if="asset.kind === 'image'">
        <button class="pb-btn" title="适应窗口(0)" @click="resetView">
          <Icon name="arrowsOut" :size="15" />
        </button>
        <span class="bar-sep" />
        <button class="pb-btn" title="水平翻转并保存" :disabled="saving" @click="applyTransform({ flipH: true })">
          <Icon name="flip" :size="15" />
        </button>
        <button class="pb-btn" title="旋转 90° 并保存?R)" :disabled="saving" @click="applyTransform({ rotate: 90 })">
          <Icon name="rotate-r" :size="15" />
        </button>
        <button class="pb-btn" title="裁切" :disabled="saving" @click="cropping = true">
          <Icon name="crop" :size="15" />
        </button>
        <button class="pb-btn" title="编辑图片" :disabled="saving" @click="ui.openEditor(asset.id)">
          <Icon name="edit" :size="15" />
        </button>
      </template>
      <span class="bar-sep" />
      <button
        class="pb-btn"
        :class="{ 'slide-on': slideshow }"
        :title="slideshow ? '停止幻灯片轮播' : '幻灯片轮播(每 3 秒自动下一张)'"
        @click="toggleSlideshow"
      >
        <Icon :name="slideshow ? 'pause' : 'play'" :size="15" />
      </button>
      <button class="pb-btn" title="全屏(F)" @click="toggleFullscreen">
        <Icon :name="fullscreen ? 'fullscreen-exit' : 'fullscreen'" :size="15" />
      </button>
      <span class="bar-sep" />
      <button class="pb-btn" title="上一张(←)" :disabled="saving" @click="step(-1)">
        <Icon name="chevron-left" :size="15" />
      </button>
      <button class="pb-btn" title="下一张(→)" :disabled="saving" @click="step(1)">
        <Icon name="chevron-right" :size="15" />
      </button>
    </div>

    <!-- 保存中遮罩 -->
    <div v-if="saving" class="saving-mask">
      <div class="spinner" />
      <span>正在保存…</span>
    </div>
  </div>
</template>

<style scoped>
.previewer {
  position: fixed;
  /* Eagle 式:只盖住内容区,标题栏/侧栏/右侧详情面板保持可见(top/right/left 由内联样式按面板状态绑定) */
  bottom: 0;
  z-index: 700;
  background: var(--viewer-bg, #111113);
  display: flex;
  transition: left 0.2s ease, right 0.2s ease;
}
.stage {
  flex: 1;
  min-width: 0;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
}
.stage:active {
  cursor: grabbing;
}
.view-img {
  max-width: none;
  max-height: none;
  transform-origin: center center;
  user-select: none;
  pointer-events: none;
  will-change: transform;
}
.stage-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-dim);
}
.top-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 18px;
  font-size: 13px;
  color: var(--vc-text);
  background: linear-gradient(rgba(0, 0, 0, 0.5), transparent);
  pointer-events: none;
}
.viewer-toolbar {
  gap: 4px;
}
/* 容器穿透让空白处可拖拽图片,控件本身必须恢复可点击 */
.viewer-toolbar > * {
  pointer-events: auto;
}
.tb-flex {
  flex: 1;
}

.pv-name {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pv-page,
.pv-dim {
  font-size: 12px;
  color: var(--vc-text-dim);
  flex: none;
}
.bottom-bar {
  position: absolute;
  bottom: 18px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(20, 20, 24, 0.82);
  backdrop-filter: blur(12px);
  border: 1px solid var(--vc-border);
  border-radius: 13px;
  padding: 7px 10px;
  box-shadow: var(--shadow-pop);
}
.bottom-bar.disabled {
  opacity: 0.55;
}
.pb-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  color: var(--vc-text);
}
.pb-btn:hover:not(:disabled) {
  background: var(--vc-hover);
  color: var(--vc-text);
}
.pb-btn.slide-on {
  color: var(--vc-accent);
  background: rgba(79, 124, 255, 0.16);
}
/* 返回按钮:描边胶囊 + 文字,与纯图标的翻页箭头形成明确差异 */
.pb-back {
  width: auto;
  padding: 0 12px;
  gap: 5px;
  border: 1px solid var(--vc-border);
  background: rgba(0, 0, 0, 0.24);
  font-size: 12px;
}
.pb-back-label {
  white-space: nowrap;
}
.pb-back:hover:not(:disabled) {
  border-color: var(--vc-accent);
  color: var(--vc-accent);
  background: rgba(79, 124, 255, 0.1);
}
.bar-sep {
  width: 1px;
  height: 18px;
  background: var(--vc-fill);
  margin: 0 4px;
}
.zoom-pct {
  font-size: 12px;
  min-width: 46px;
  text-align: center;
  color: var(--vc-text-mid);
  font-variant-numeric: tabular-nums;
}
.zoom-slider {
  width: 150px;
  height: 3px;
  appearance: none;
  -webkit-appearance: none;
  border-radius: 2px;
  background: var(--vc-fill, rgba(255, 255, 255, 0.2));
  outline: none;
  cursor: pointer;
  margin: 0 10px;
}
.zoom-slider::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: #fff;
  border: none;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}
.saving-mask {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(0, 0, 0, 0.5);
  color: var(--vc-text);
  font-size: 13px;
  z-index: 20;
}
.spinner {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 3px solid var(--vc-track);
  border-top-color: var(--accent);
  animation: spin 0.9s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
