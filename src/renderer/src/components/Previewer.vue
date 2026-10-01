<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
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
  if (!el || !natural.value.w) return 1
  // 旋转 90/270 后宽高互换
  const rot = totalRot.value % 180 !== 0
  const w = rot ? natural.value.h : natural.value.w
  const h = rot ? natural.value.w : natural.value.h
  // 自适应窗口:小图也放大到铺满可视区(默认打开即适配,不设 100% 上限)
  return Math.max(0.1, Math.min(el.clientWidth / w, el.clientHeight / h))
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

// 拖拽平移(按帧合并:高回报率鼠标每秒数百上千个 mousemove,逐个更新会淹没主线程)
let panning = false
let panStart = { x: 0, y: 0, tx: 0, ty: 0, lastX: 0, lastY: 0 }
let panFrame = false
/** 滚轮缩放按帧合并的暂存 */
let wheelPending: { x: number; y: number; factor: number } | null = null
function panDown(e: MouseEvent): void {
  if (e.button !== 0 || cropping.value) return
  panning = true
  panStart = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty, lastX: e.clientX, lastY: e.clientY }
  window.addEventListener('mousemove', panMove)
  window.addEventListener('mouseup', panUp)
}
function panMove(e: MouseEvent): void {
  if (!panning) return
  panStart.lastX = e.clientX
  panStart.lastY = e.clientY
  if (panFrame) return
  panFrame = true
  requestAnimationFrame(() => {
    panFrame = false
    if (!panning) return
    // 拖动期间只写合成层样式,不碰响应式(避免每帧触发组件重渲染);松手时一次性同步
    const tx = panStart.tx + (panStart.lastX - panStart.x)
    const ty = panStart.ty + (panStart.lastY - panStart.y)
    const el = imgEl.value
    const base = baseScale.value || 1
    if (el) el.style.transform = `translate(${tx}px, ${ty}px) scale(${view.scale / base})${extraCss()}`
  })
}
function panUp(): void {
  panning = false
  window.removeEventListener('mousemove', panMove)
  window.removeEventListener('mouseup', panUp)
  view.tx = panStart.tx + (panStart.lastX - panStart.x)
  view.ty = panStart.ty + (panStart.lastY - panStart.y)
}

const transformStyle = computed(() => {
  const base = baseScale.value > 0 ? baseScale.value : 1
  // 盒子恒为原始比例(位图不变形),旋转/翻转放在 transform 里作用于内容
  const extra = extraCss()
  return {
    width: Math.round(natural.value.w * base) + 'px',
    height: Math.round(natural.value.h * base) + 'px',
    transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale / base})${extra}`
  }
})
/** 暂存变换的 CSS 片段:矩阵 M = F^b·R^r,字符串从左到右即矩阵乘序(scaleX 在 rotate 左) */
function extraCss(): string {
  let m = ''
  if (totalRot.value) m += ` rotate(${totalRot.value}deg)`
  if (flipped.value) m = ' scaleX(-1)' + m
  return m
}

function onImgLoad(): void {
  // 缩略图与原图各触发一次;尺寸与适配都来自库内记录,这里只需点亮显示
  imgLoaded.value = true
}

watch(
  () => [ui.preview.assetId, ui.preview.open],
  () => {
    if (!ui.preview.open) return
    imgLoaded.value = false
    cropping.value = false
    // 库内尺寸即时可用,挂载后立即适配;每次打开/切换都回到自适应窗口
    nextTick(() => fitView())
  }
)

// ---------- 切换 ----------
function step(delta: number): void {
  if (saving.value || flushing) return
  // 后台写盘当前图的暂存变换,切换立即发生(不等待保存,无"卡一下再切"的观感)
  const cur = asset.value
  if (cur && hasPending.value) void flushPending(cur.id)
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

// ---------- 变换暂存(翻转/旋转不立即写盘,切换图片或退出预览时统一保存) ----------
/** 归并态:任何 90° 旋转×水平翻转序列都等价于 (rotUnits, flipped);写盘与视觉共用同一归并,一次 apply 完成 */
const rotUnits = ref(0) // 0..3,顺时针 90° 的倍数
const flipped = ref(false)
const hasPending = computed(() => rotUnits.value !== 0 || flipped.value)
let flushing = false

/** 等效旋转角与显示宽高互换 */
const totalRot = computed(() => ((rotUnits.value % 4) + 4) % 4 * 90)

function queueTransform(op: { rotate?: number; flipH?: boolean }): void {
  if (!asset.value || asset.value.missing || cropping.value || flushing) return
  if (op.flipH) flipped.value = !flipped.value
  if (op.rotate) {
    // 已翻转时旋转方向取反(FR = R⁻¹F),保证与逐次操作的最终效果一致
    rotUnits.value = flipped.value ? rotUnits.value - 1 : rotUnits.value + 1
  }
  // 视觉立即生效并重新适配(旋转后等效宽高互换)
  nextTick(() => fitView())
}

/** 把暂存变换一次性写盘(切换/退出/进入裁切或编辑器前调用);可指定目标,退出后组件上下文失效时仍可后台完成 */
async function flushPending(targetId?: number): Promise<void> {
  const id = targetId ?? asset.value?.id
  if (flushing || !id || !hasPending.value) return
  flushing = true
  const deg = ((rotUnits.value % 4) + 4) % 4 * 90
  const flop = flipped.value
  rotUnits.value = 0
  flipped.value = false
  if (deg || flop) {
    try {
      await window.mv.editor.apply({ id, rotate: deg || undefined, flipH: flop || undefined })
    } catch (e) {
      // 不回滚归并态:用户可能已切到其他图,回滚会污染新图视觉;仅提示丢本次操作
      toast.error(`保存失败: ${(e as Error).message}`)
    }
  }
  flushing = false
}

// ---------- 裁切 ----------
const cropping = ref(false)
/** 进入裁切前先写盘暂存变换,保证裁切坐标对应磁盘上的真实图像 */
async function startCrop(): Promise<void> {
  if (!asset.value || asset.value.missing) return
  await flushPending()
  cropping.value = true
}
/** 打开编辑器前同样先写盘,编辑器直接操作磁盘文件 */
async function openEditorFlushed(): Promise<void> {
  if (!asset.value || flushing) return
  await flushPending()
  ui.openEditor(asset.value.id)
}
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
  // 先退出预览,暂存变换后台写盘(退出零等待)
  const cur = asset.value
  ui.closePreview()
  if (cur && hasPending.value) void flushPending(cur.id)
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
      if (asset.value?.kind === 'image') queueTransform({ rotate: 90 })
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
  // 首次打开:触发挂载的那次状态变化先于 watcher 注册,这里兜底适配
  nextTick(() => {
    if (ui.preview.open && asset.value) fitView()
  })
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
  nextTick(applyViewStyle)
}

/** 直接写合成层变换(绕开 Vue 渲染管线,拖动零延迟);松手/缩放后再同步 view 状态 */
const imgEl = ref<HTMLImageElement | null>(null)
function applyViewStyle(): void {
  const el = imgEl.value
  if (!el) return
  const base = baseScale.value > 0 ? baseScale.value : 1
  el.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.scale / base})${extraCss()}`
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
          ref="imgEl"
          :key="asset.id + '-' + asset.fileModifiedAt"
          :src="imgLoaded ? sourceUrl(asset) : thumbUrl(asset)"
          class="view-img"
          :style="transformStyle"
          draggable="false"
          decoding="async"
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
      <button class="pb-btn" title="返回(Esc)" :disabled="saving" @click="close">
        <Icon name="chevron-left" :size="16" />
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
        <span v-if="hasPending" class="pend-chip" title="翻转/旋转尚未写盘,切换图片或退出预览时自动保存">
          <span class="pend-dot" />未保存
        </span>
        <span class="bar-sep" />
        <button class="pb-btn" title="水平翻转(切换或退出时保存)" @click="queueTransform({ flipH: true })">
          <Icon name="flip" :size="15" />
        </button>
        <button class="pb-btn" title="旋转 90°(R,切换或退出时保存)" @click="queueTransform({ rotate: 90 })">
          <Icon name="rotate-r" :size="15" />
        </button>
        <button class="pb-btn" title="裁切" :disabled="saving || flushing" @click="startCrop">
          <Icon name="crop" :size="15" />
        </button>
        <button class="pb-btn" title="编辑图片" :disabled="flushing" @click="openEditorFlushed">
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
/* 未保存变换指示 */
.pend-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(255, 180, 77, 0.16);
  color: var(--warn, #ffb44d);
  font-size: 11px;
  white-space: nowrap;
}
.pend-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
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
