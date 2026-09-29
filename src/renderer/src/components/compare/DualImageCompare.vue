<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type { Asset, AssetFull, DiffResult } from '@sh/types'
import { useLibraryStore } from '../../stores/library'
import { useToastStore } from '../../stores/toast'
import { sourceUrl } from '../../util/format'
import Icon from '../Icon.vue'
import { usePanZoom, pzStyle, type PanZoom } from './usePanZoom'

const props = defineProps<{ assets: [Asset, Asset] }>()

const lib = useLibraryStore()
const toast = useToastStore()

type Mode = 'side' | 'wipe' | 'diff' | 'flicker'
const MODES: { key: Mode; label: string }[] = [
  { key: 'side', label: '并排' },
  { key: 'wipe', label: '擦除' },
  { key: 'diff', label: '差值' },
  { key: 'flicker', label: '闪烁' }
]

const mode = ref<Mode>('side')
const sync = ref(true)

// ---------- 缩放平移 ----------
const shared = usePanZoom(0.1, 32)
const pzA = usePanZoom(0.1, 32)
const pzB = usePanZoom(0.1, 32)
const eff = (side: 'a' | 'b'): PanZoom => (sync.value ? shared.pz : side === 'a' ? pzA.pz : pzB.pz)
const eng = (side: 'a' | 'b') => (side === 'a' ? pzA : pzB)

const nat = reactive({ a: { w: 0, h: 0 }, b: { w: 0, h: 0 } })
const paneEls = reactive<{ a: HTMLElement | null; b: HTMLElement | null }>({ a: null, b: null })

function paneSize(side: 'a' | 'b'): { w: number; h: number } {
  const el = paneEls[side]
  return el ? { w: el.clientWidth, h: el.clientHeight } : { w: 1, h: 1 }
}

function onImgLoad(side: 'a' | 'b', e: Event): void {
  const img = e.target as HTMLImageElement
  nat[side].w = img.naturalWidth
  nat[side].h = img.naturalHeight
  fitAll()
}

function fitAll(): void {
  const wa = paneSize('a')
  shared.fit(wa.w, wa.h, nat.a.w || nat.b.w, nat.a.h || nat.b.h)
  pzA.fit(wa.w, wa.h, nat.a.w, nat.a.h)
  const wb = paneSize('b')
  pzB.fit(wb.w, wb.h, nat.b.w, nat.b.h)
}

function onWheel(side: 'a' | 'b', e: WheelEvent): void {
  e.preventDefault()
  const el = paneEls[side]!
  const rect = el.getBoundingClientRect()
  const factor = e.deltaY < 0 ? 1.13 : 1 / 1.13
  if (sync.value) {
    // 同步:以各自 pane 的相同相对位置为锚
    const ra = paneEls.a?.getBoundingClientRect()
    const rb = paneEls.b?.getBoundingClientRect()
    const fx = (e.clientX - rect.left) / rect.width
    const fy = (e.clientY - rect.top) / rect.height
    if (ra) shared.zoomAt(ra.width, ra.height, fx * ra.width, fy * ra.height, factor)
    if (rb) shared.zoomAt(rb.width, rb.height, fx * rb.width, fy * rb.height, factor)
  } else {
    eng(side).zoomAt(rect.width, rect.height, e.clientX - rect.left, e.clientY - rect.top, factor)
  }
}

let panning: { side: 'a' | 'b'; x: number; y: number; tx: number; ty: number } | null = null
function panDown(side: 'a' | 'b', e: MouseEvent): void {
  if (e.button !== 0 || pickerOn.value) return
  panning = { side, x: e.clientX, y: e.clientY, tx: eff(side).tx, ty: eff(side).ty }
  window.addEventListener('mousemove', panMove)
  window.addEventListener('mouseup', panUp)
}
function panMove(e: MouseEvent): void {
  if (!panning) return
  const p = eff(panning.side)
  p.tx = panning.tx + (e.clientX - panning.x)
  p.ty = panning.ty + (e.clientY - panning.y)
}
function panUp(): void {
  panning = null
  window.removeEventListener('mousemove', panMove)
  window.removeEventListener('mouseup', panUp)
}

const zoomPct = computed(() => Math.round((sync.value ? shared.pz.scale : pzA.pz.scale) * 100))

// ---------- 擦除 ----------
const wipePct = ref(50)
let wiping = false
function wipeDown(e: MouseEvent): void {
  wiping = true
  wipeMove(e)
  window.addEventListener('mousemove', wipeMove)
  window.addEventListener('mouseup', wipeUp)
}
function wipeMove(e: MouseEvent): void {
  const el = paneEls.a
  if (!el) return
  const rect = el.getBoundingClientRect()
  wipePct.value = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
}
function wipeUp(): void {
  wiping = false
  window.removeEventListener('mousemove', wipeMove)
  window.removeEventListener('mouseup', wipeUp)
}

// ---------- 闪烁 ----------
const flicker = reactive({ side: 'a' as 'a' | 'b', ms: 800, timer: 0 as number | null })
function restartFlicker(): void {
  if (flicker.timer) window.clearInterval(flicker.timer)
  flicker.timer = window.setInterval(() => {
    flicker.side = flicker.side === 'a' ? 'b' : 'a'
  }, Math.max(120, Math.min(2000, flicker.ms)))
}
onMounted(() => restartFlicker())
onBeforeUnmount(() => {
  if (flicker.timer) window.clearInterval(flicker.timer)
})

// ---------- 差值 ----------
const diff = reactive<{ loading: boolean; result: DiffResult | null; error: string }>({
  loading: false,
  result: null,
  error: ''
})
const diffPz = usePanZoom(0.1, 32)

async function loadDiff(): Promise<void> {
  diff.loading = true
  diff.error = ''
  try {
    diff.result = await window.mv.compare.diff(props.assets[0].id, props.assets[1].id, false)
  } catch (e) {
    diff.error = (e as Error).message
  } finally {
    diff.loading = false
  }
}
watch(mode, (m) => {
  if (m === 'diff' && !diff.result && !diff.loading) void loadDiff()
})
watch(
  [() => props.assets[0]?.id, () => props.assets[1]?.id],
  () => {
    diff.result = null
  }
)

// ---------- 辅助工具 ----------
const gridOn = ref(false)
const crossOn = ref(false)
const pickerOn = ref(false)
const loupeOn = ref(false)

const cross = reactive<{
  ix: number
  iy: number
  visible: boolean
  pa?: { x: number; y: number }
  pb?: { x: number; y: number }
}>({ ix: 0, iy: 0, visible: false, pa: undefined, pb: undefined })
const stageEl = ref<HTMLElement | null>(null)

function paneMouseMove(side: 'a' | 'b', e: MouseEvent): void {
  if (!crossOn.value && !loupeOn.value) return
  const el = paneEls[side]!
  const rect = el.getBoundingClientRect()
  const { w, h } = paneSize(side)
  const { ix, iy } = eng(side).toImage(
    w,
    h,
    e.clientX - rect.left,
    e.clientY - rect.top,
    nat[side].w,
    nat[side].h
  )
  cross.ix = ix
  cross.iy = iy
  cross.visible = true
  if (loupeOn.value) {
    loupe.side = side
    // 放大镜跟随光标(限制在舞台内)
    const sr = stageEl.value?.getBoundingClientRect()
    if (sr) {
      loupe.x = Math.max(4, Math.min(sr.width - 140, e.clientX - sr.left + 18))
      loupe.y = Math.max(4, Math.min(sr.height - 140, e.clientY - sr.top + 18))
    }
  }
  const ra = paneEls.a?.getBoundingClientRect()
  const rb = paneEls.b?.getBoundingClientRect()
  // 同步模式下两条 pane 用同一图像坐标
  if (sync.value && ra && rb) {
    const pa = shared.toPane(ra.width, ra.height, ix, iy, nat.a.w, nat.a.h)
    const pb = shared.toPane(rb.width, rb.height, ix, iy, nat.b.w, nat.b.h)
    cross.pa = { x: pa.px, y: pa.py }
    cross.pb = { x: pb.px, y: pb.py }
  } else {
    const p = eng(side).toPane(w, h, ix, iy, nat[side].w, nat[side].h)
    if (side === 'a') {
      cross.pa = { x: p.px, y: p.py }
      cross.pb = undefined
    } else {
      cross.pb = { x: p.px, y: p.py }
      cross.pa = undefined
    }
  }
}

// 取色器:离屏 canvas 采样
const sampleCanvas = reactive<Record<'a' | 'b', HTMLCanvasElement | null>>({ a: null, b: null })
/** canvas 未就绪时的待取色坐标,加载完成后自动重试,免去再点一次 */
const pendingPick = ref<{ side: 'a' | 'b'; x: number; y: number } | null>(null)
function ensureCanvas(side: 'a' | 'b'): void {
  if (sampleCanvas[side]) return
  const img = new Image()
  img.onload = () => {
    const c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    c.getContext('2d')!.drawImage(img, 0, 0)
    sampleCanvas[side] = c
    if (pendingPick.value && pendingPick.value.side === side) {
      const p = pendingPick.value
      pendingPick.value = null
      void pickAt(p.side, p.x, p.y)
    }
  }
  img.src = sourceUrl(props.assets[side === 'a' ? 0 : 1])
}

async function paneClick(side: 'a' | 'b', e: MouseEvent): Promise<void> {
  if (!pickerOn.value) return
  ensureCanvas(side)
  const el = paneEls[side]!
  const rect = el.getBoundingClientRect()
  const { w, h } = paneSize(side)
  const { ix, iy } = eng(side).toImage(w, h, e.clientX - rect.left, e.clientY - rect.top, nat[side].w, nat[side].h)
  const x = Math.max(0, Math.min((sampleCanvas[side]?.width || nat[side].w) - 1, Math.round(ix)))
  const y = Math.max(0, Math.min((sampleCanvas[side]?.height || nat[side].h) - 1, Math.round(iy)))
  if (!sampleCanvas[side]) {
    pendingPick.value = { side, x, y }
    toast.push('正在读取像素数据…')
    return
  }
  await pickAt(side, x, y)
}

async function pickAt(side: 'a' | 'b', x: number, y: number): Promise<void> {
  const c = sampleCanvas[side]
  if (!c) return
  x = Math.max(0, Math.min(c.width - 1, x))
  y = Math.max(0, Math.min(c.height - 1, y))
  const d = c.getContext('2d')!.getImageData(x, y, 1, 1).data
  const hex = `#${[d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`
  try {
    await navigator.clipboard.writeText(hex)
    toast.success(`已复制 ${hex} · rgb(${d[0]}, ${d[1]}, ${d[2]})`)
  } catch {
    toast.push(`${hex} · rgb(${d[0]}, ${d[1]}, ${d[2]})`)
  }
}

// 放大镜
const loupe = reactive<{ side: 'a' | 'b'; x: number; y: number }>({ side: 'a', x: 0, y: 0 })
const loupeCanvas = ref<HTMLCanvasElement | null>(null)
const LOUPE_SIZE = 132
const LOUPE_MAG = 6
function drawLoupe(cx: number, cy: number): void {
  const c = loupeCanvas.value
  if (!c) return
  const ctx = c.getContext('2d')!
  const src = sampleCanvas[loupe.side]
  c.width = LOUPE_SIZE * 2
  c.height = LOUPE_SIZE * 2
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, c.width, c.height)
  if (src) {
    const region = LOUPE_SIZE / LOUPE_MAG // 采样区域(源像素)
    ctx.drawImage(src, cx - region / 2, cy - region / 2, region, region, 0, 0, c.width, c.height)
  }
  // 十字准星
  ctx.strokeStyle = 'rgba(255,80,80,0.9)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(c.width / 2, c.height / 2 - 16)
  ctx.lineTo(c.width / 2, c.height / 2 + 16)
  ctx.moveTo(c.width / 2 - 16, c.height / 2)
  ctx.moveTo(c.width / 2 + 16, c.height / 2)
  ctx.moveTo(c.width / 2 - 16, c.height / 2)
  ctx.lineTo(c.width / 2 + 16, c.height / 2)
  ctx.stroke()
}
watch(
  () => [cross.ix, cross.iy, loupe.side],
  () => {
    if (loupeOn.value) drawLoupe(cross.ix, cross.iy)
  }
)

// 差值视图的缩放平移
function onWheelDiff(e: WheelEvent): void {
  e.preventDefault()
  const el = paneEls.a!
  const rect = el.getBoundingClientRect()
  diffPz.zoomAt(rect.width, rect.height, e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.13 : 1 / 1.13)
}
let panDiff: { x: number; y: number; tx: number; ty: number } | null = null
function panDownDiff(e: MouseEvent): void {
  if (e.button !== 0) return
  panDiff = { x: e.clientX, y: e.clientY, tx: diffPz.pz.tx, ty: diffPz.pz.ty }
  window.addEventListener('mousemove', panMoveDiff)
  window.addEventListener('mouseup', panUpDiff)
}
function panMoveDiff(e: MouseEvent): void {
  if (!panDiff) return
  diffPz.pz.tx = panDiff.tx + (e.clientX - panDiff.x)
  diffPz.pz.ty = panDiff.ty + (e.clientY - panDiff.y)
}
function panUpDiff(): void {
  panDiff = null
  window.removeEventListener('mousemove', panMoveDiff)
  window.removeEventListener('mouseup', panUpDiff)
}

// ---------- 参数差异 ----------
const fullA = ref<AssetFull | null>(null)
const fullB = ref<AssetFull | null>(null)
onMounted(async () => {
  const [fa, fb] = await Promise.all([
    window.mv.assets.get(props.assets[0].id).catch(() => null),
    window.mv.assets.get(props.assets[1].id).catch(() => null)
  ])
  fullA.value = fa
  fullB.value = fb
})

interface ParamDiffRow {
  key: string
  a: string
  b: string
}
const paramRows = computed<ParamDiffRow[]>(() => {
  const ma = fullA.value?.aiMeta
  const mb = fullB.value?.aiMeta
  if (!ma && !mb) return []
  const rows: ParamDiffRow[] = []
  const keys = new Set([...Object.keys(ma?.params ?? {}), ...Object.keys(mb?.params ?? {})])
  for (const k of keys) {
    const va = ma?.params?.[k] ?? '(无)'
    const vb = mb?.params?.[k] ?? '(无)'
    if (va !== vb) rows.push({ key: k, a: va, b: vb })
  }
  if ((ma?.prompt ?? '') !== (mb?.prompt ?? '')) {
    rows.unshift({ key: '提示词', a: ma?.prompt || '(无)', b: mb?.prompt || '(无)' })
  }
  return rows
})
const paramState = computed<{ state: 'none' | 'same' | 'diff'; rows: ParamDiffRow[] }>(() => {
  const ma = fullA.value?.aiMeta
  const mb = fullB.value?.aiMeta
  if (!ma && !mb) return { state: 'none', rows: [] }
  if (!paramRows.value.length) return { state: 'same', rows: [] }
  return { state: 'diff', rows: paramRows.value }
})
const paramPanelOpen = ref(true)

// ---------- 导出 ----------
const exporting = ref(false)
async function doExport(): Promise<void> {
  exporting.value = true
  try {
    const saved = await window.mv.compare.exportResult({
      aId: props.assets[0].id,
      bId: props.assets[1].id,
      type: mode.value,
      wipePct: Math.round(wipePct.value),
      flickerSide: flicker.side
    })
    if (saved) toast.success(`已导出: ${saved}`)
  } catch (e) {
    toast.error((e as Error).message)
  } finally {
    exporting.value = false
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
})
function onKey(e: KeyboardEvent): void {
  const t = e.target as HTMLElement
  if (t.tagName === 'INPUT') return
  if (e.key === '0') fitAll()
}

const pixelated = computed(() => (sync.value ? shared.pz.scale : pzA.pz.scale) >= 4)

// 差值图加载后适应窗口
function diffImgLoad(e: Event): void {
  const img = e.target as HTMLImageElement
  const el = paneEls.a
  if (el && img.naturalWidth) {
    diffPz.fit(el.clientWidth, el.clientHeight, img.naturalWidth, img.naturalHeight, 1)
  }
}

void lib
</script>

<template>
  <div class="dual-image">
    <!-- 工具条 -->
    <div class="cw-toolbar">
      <div class="mode-tabs">
        <button
          v-for="m in MODES"
          :key="m.key"
          class="mode-tab"
          :class="{ active: mode === m.key }"
          @click="mode = m.key"
        >
          {{ m.label }}
        </button>
      </div>
      <span class="tb-sep" />
      <button class="tool-btn" :class="{ on: sync }" :title="sync ? '当前:同步缩放平移' : '当前:各自独立'" @click="sync = !sync">
        <Icon :name="sync ? 'compare' : 'x'" :size="13" />
        {{ sync ? '同步' : '独立' }}
      </button>
      <span class="zoom-label">{{ zoomPct }}%</span>
      <button class="tool-btn" title="适应窗口" @click="fitAll"><Icon name="arrowsOut" :size="13" /></button>

      <template v-if="mode === 'side'">
        <span class="tb-sep" />
        <button class="tool-btn" :class="{ on: gridOn }" title="网格叠加(检查构图对齐)" @click="gridOn = !gridOn">
          <Icon name="grid" :size="13" /> 网格
        </button>
        <button class="tool-btn" :class="{ on: crossOn }" title="跟随光标的横竖参考线" @click="crossOn = !crossOn">
          <Icon name="plus" :size="13" /> 参考线
        </button>
        <button class="tool-btn" :class="{ on: pickerOn }" title="取色器:点击取像素颜色并复制" @click="pickerOn = !pickerOn">
          <Icon name="palette" :size="13" /> 取色
        </button>
        <button class="tool-btn" :class="{ on: loupeOn }" title="放大镜(6 倍像素级)" @click="loupeOn = !loupeOn; if (loupeOn) ensureCanvas('a')">
          <Icon name="search" :size="13" /> 放大镜
        </button>
      </template>

      <template v-if="mode === 'wipe'">
        <span class="tb-sep" />
        <input v-model.number="wipePct" class="wipe-slider" type="range" min="0" max="100" step="0.5" title="分割位置" />
        <span class="zoom-label">{{ wipePct.toFixed(0) }}%</span>
      </template>
      <template v-if="mode === 'flicker'">
        <span class="tb-sep" />
        <span class="zoom-label">间隔</span>
        <input v-model.number="flicker.ms" class="wipe-slider" type="range" min="120" max="2000" step="20" @change="restartFlicker" />
        <span class="zoom-label">{{ flicker.ms }}ms</span>
      </template>

      <div style="flex: 1" />
      <button class="tool-btn" :disabled="exporting" @click="doExport">
        <Icon name="save" :size="13" /> {{ exporting ? '导出中…' : '导出 PNG' }}
      </button>
    </div>

    <!-- 画布区 -->
    <div ref="stageEl" class="cw-stage">
      <!-- 并排 -->
      <div v-if="mode === 'side'" class="side-wrap">
        <div
          v-for="side in ['a', 'b'] as const"
          :key="side"
          :ref="(el) => (paneEls[side] = el as HTMLElement)"
          class="pane"
          @wheel="onWheel(side, $event)"
          @mousedown="panDown(side, $event)"
          @mousemove="paneMouseMove(side, $event)"
          @mouseleave="cross.visible = false"
          @click="paneClick(side, $event)"
        >
          <img
            :src="sourceUrl(assets[side === 'a' ? 0 : 1])"
            class="view"
            :class="{ pixelated }"
            :style="pzStyle(eff(side))"
            draggable="false"
            alt=""
            @load="onImgLoad(side, $event)"
          />
          <div v-if="gridOn" class="grid-overlay">
            <svg width="100%" height="100%">
              <line v-for="i in 1" :key="i" x1="33.3%" y1="0" x2="33.3%" y2="100%" />
              <line x1="66.6%" y1="0" x2="66.6%" y2="100%" />
              <line x1="0" y1="33.3%" x2="100%" y2="33.3%" />
              <line x1="0" y1="66.6%" x2="100%" y2="66.6%" />
            </svg>
          </div>
          <template v-if="crossOn && cross.visible">
            <div v-if="cross.pa" class="crossline v" :style="{ left: cross.pa.x + 'px' }" />
            <div v-if="cross.pa" class="crossline h" :style="{ top: cross.pa.y + 'px' }" />
          </template>
          <div class="pane-tag">{{ side === 'a' ? '左' : '右' }} · {{ assets[side === 'a' ? 0 : 1].fileName }}</div>
        </div>
      </div>

      <!-- 擦除 -->
      <div v-else-if="mode === 'wipe'" class="wipe-wrap">
        <div
          ref="paneEls.a"
          class="pane wipe-pane"
          @wheel="onWheel('a', $event)"
          @mousedown="panDown('a', $event)"
        >
          <img
            :src="sourceUrl(assets[0])"
            class="view"
            :style="pzStyle(shared.pz)"
            draggable="false"
            alt=""
            @load="onImgLoad('a', $event)"
            @mousedown.stop="panDown('a', $event)"
          />
          <div class="wipe-clip" :style="{ clipPath: `inset(0 0 0 ${wipePct}%)` }">
            <img
              :src="sourceUrl(assets[1])"
              class="view"
              :style="pzStyle(shared.pz)"
              draggable="false"
              alt=""
              @load="onImgLoad('b', $event)"
              @mousedown.stop="panDown('a', $event)"
            />
          </div>
          <div class="divider" :style="{ left: wipePct + '%' }" @mousedown.stop="wipeDown">
            <span class="divider-grip" />
          </div>
        </div>
        <div class="wipe-labels">
          <span>左:{{ assets[0].fileName }}</span>
          <span>右:{{ assets[1].fileName }}</span>
        </div>
      </div>

      <!-- 差值 -->
      <div v-else-if="mode === 'diff'" class="diff-wrap">
        <div ref="paneEls.a" class="pane" @wheel="onWheelDiff($event)" @mousedown="panDownDiff($event)">
          <div v-if="diff.loading" class="center-hint"><div class="spinner" /> 正在逐像素计算差值…</div>
          <div v-else-if="diff.error" class="center-hint err">{{ diff.error }}</div>
          <img
            v-else-if="diff.result"
            :src="`data:image/png;base64,${diff.result.base64}`"
            class="view"
            :style="pzStyle(diffPz.pz)"
            draggable="false"
            alt=""
            @load="diffImgLoad"
          />
        </div>
        <div v-if="diff.result?.note" class="diff-note">
          <Icon name="info" :size="12" /> {{ diff.result.note }}
        </div>
      </div>

      <!-- 闪烁 -->
      <div v-else class="flicker-wrap">
        <div ref="paneEls.a" class="pane" @wheel="onWheel('a', $event)" @mousedown="panDown('a', $event)">
          <img
            v-show="flicker.side === 'a'"
            :src="sourceUrl(assets[0])"
            class="view"
            :class="{ pixelated }"
            :style="pzStyle(shared.pz)"
            draggable="false"
            alt=""
            @load="onImgLoad('a', $event)"
          />
          <img
            v-show="flicker.side === 'b'"
            :src="sourceUrl(assets[1])"
            class="view"
            :class="{ pixelated }"
            :style="pzStyle(shared.pz)"
            draggable="false"
            alt=""
            @load="onImgLoad('b', $event)"
          />
        </div>
        <div class="flicker-label" :class="flicker.side">
          当前显示:{{ flicker.side === 'a' ? '左' : '右' }} · {{ (flicker.side === 'a' ? assets[0] : assets[1]).fileName }}
        </div>
      </div>

      <!-- 放大镜 -->
      <div v-if="loupeOn && cross.visible" class="loupe" :style="{ left: loupe.x + 'px', top: loupe.y + 'px' }">
        <canvas ref="loupeCanvas" />
        <span class="loupe-tag">6×</span>
      </div>
    </div>

    <!-- 参数差异面板 -->
    <div class="param-panel" :class="{ open: paramPanelOpen }">
      <button class="pp-head" @click="paramPanelOpen = !paramPanelOpen">
        <Icon name="chevron-right" :size="13" :style="{ transform: paramPanelOpen ? 'rotate(90deg)' : '' }" />
        参数差异面板
        <span v-if="paramState.state === 'diff'" class="badge-count accent">{{ paramState.rows.length }} 项不同</span>
      </button>
      <div v-if="paramPanelOpen" class="pp-body">
        <div v-if="paramState.state === 'none'" class="pp-hint">两张图都没有生成参数</div>
        <div v-else-if="paramState.state === 'same'" class="pp-hint">两边生成参数完全一致</div>
        <table v-else class="pp-table">
          <thead>
            <tr>
              <th style="width: 120px">参数</th>
              <th>左 {{ assets[0].fileName }}</th>
              <th>右 {{ assets[1].fileName }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in paramState.rows" :key="r.key">
              <td class="k">{{ r.key }}</td>
              <td class="v">{{ r.a }}</td>
              <td class="v">{{ r.b }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dual-image {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.cw-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}
.mode-tabs {
  display: flex;
  background: var(--bg-glass);
  border-radius: 8px;
  padding: 2px;
}
.mode-tab {
  padding: 6px 14px;
  border-radius: 7px;
  font-size: 12.5px;
  color: var(--text-dim);
}
.mode-tab.active {
  background: var(--accent-soft);
  color: #a9c0ff;
}
.tb-sep {
  width: 1px;
  height: 16px;
  background: var(--border-strong);
}
.tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  border-radius: 7px;
  font-size: 12px;
  color: var(--text-dim);
  border: 1px solid var(--border);
}
.tool-btn:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--border-strong);
}
.tool-btn.on {
  color: #a9c0ff;
  background: var(--accent-soft);
  border-color: rgba(79, 124, 255, 0.4);
}
.zoom-label {
  font-size: 12px;
  color: var(--text-faint);
  min-width: 44px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.wipe-slider {
  width: 130px;
}
.cw-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  position: relative;
  background: var(--viewer-bg, #111113);
}
.side-wrap {
  flex: 1;
  display: flex;
  gap: 4px;
  padding: 6px;
  min-width: 0;
}
.pane {
  position: relative;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 6px;
  cursor: grab;
}
.pane:active {
  cursor: grabbing;
}
.view {
  position: absolute;
  max-width: none;
  max-height: none;
  user-select: none;
  pointer-events: none;
  will-change: transform;
}
.view.pixelated {
  image-rendering: pixelated;
}
.pane-tag {
  position: absolute;
  left: 8px;
  top: 8px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.75);
  background: rgba(0, 0, 0, 0.55);
  border-radius: 5px;
  padding: 3px 8px;
  max-width: 60%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}
.grid-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.grid-overlay line {
  stroke: rgba(255, 255, 255, 0.35);
  stroke-width: 1;
}
.crossline {
  position: absolute;
  background: rgba(79, 124, 255, 0.8);
  pointer-events: none;
}
.crossline.v {
  top: 0;
  bottom: 0;
  width: 1px;
}
.crossline.h {
  left: 0;
  right: 0;
  height: 1px;
}

/* 擦除 */
.wipe-wrap,
.diff-wrap,
.flicker-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 6px;
  min-height: 0;
}
.wipe-pane {
  flex: 1;
}
.wipe-clip {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
.wipe-clip .view {
  position: absolute;
  left: 50%;
  top: 50%;
}
.divider {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 22px;
  margin-left: -11px;
  cursor: ew-resize;
  z-index: 5;
}
.divider::before {
  content: '';
  position: absolute;
  left: 10.5px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #ff5d5d;
}
.divider-grip {
  position: absolute;
  left: 3px;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 34px;
  border-radius: 8px;
  background: #ff5d5d;
}
.wipe-labels {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-faint);
  padding: 6px 4px 0;
}
.center-hint {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-dim);
  font-size: 13px;
}
.center-hint.err {
  color: var(--danger);
}
.spinner {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.15);
  border-top-color: var(--accent);
  animation: spin 0.9s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.diff-note {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 4px 0;
  font-size: 11.5px;
  color: var(--warn);
}
.flicker-label {
  align-self: center;
  margin-top: 6px;
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
}
.flicker-label.b {
  background: var(--accent-soft);
  color: #a9c0ff;
}
.loupe {
  position: absolute;
  z-index: 40;
  width: 132px;
  height: 132px;
  border-radius: 10px;
  overflow: hidden;
  border: 2px solid var(--border-strong);
  background: #000;
  pointer-events: none;
  box-shadow: var(--shadow-pop);
}
.loupe canvas {
  width: 100%;
  height: 100%;
}
.loupe-tag {
  position: absolute;
  right: 4px;
  bottom: 2px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.7);
}

/* 参数差异面板 */
.param-panel {
  border-top: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.22);
  flex: none;
  max-height: 32%;
  display: flex;
  flex-direction: column;
}
.pp-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  font-size: 12.5px;
  color: var(--text-dim);
}
.pp-head:hover {
  color: var(--text);
}
.pp-body {
  overflow: auto;
  padding: 0 14px 10px;
}
.pp-hint {
  font-size: 12px;
  color: var(--text-faint);
  padding: 6px 0;
}
.pp-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11.5px;
}
.pp-table th {
  text-align: left;
  color: var(--text-faint);
  font-weight: 500;
  padding: 4px 8px;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}
.pp-table td {
  padding: 4px 8px;
  border-bottom: 1px solid var(--border);
  vertical-align: top;
  word-break: break-all;
  user-select: text;
}
.pp-table .k {
  color: var(--text-faint);
  white-space: nowrap;
}
.pp-table .v {
  color: var(--text-dim);
  max-width: 380px;
}
</style>
