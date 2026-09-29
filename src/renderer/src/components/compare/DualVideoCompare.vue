<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type { Asset, AssetFull, PairScore, PlayInfo, QualityReport } from '@sh/types'
import { useToastStore } from '../../stores/toast'
import { fmtBytes, fmtDuration } from '../../util/format'
import Icon from '../Icon.vue'
import { usePanZoom, pzStyle } from './usePanZoom'
import QualityChart from './QualityChart.vue'

const props = defineProps<{ assets: [Asset, Asset] }>()

const toast = useToastStore()

type Workflow = 'pick' | 'accept'
type Mode = 'side' | 'wipe' | 'flicker'

const workflow = ref<Workflow>('pick')
const mode = ref<Mode>('side')

// ---------- 播放源 ----------
interface SideState {
  asset: Asset
  info: PlayInfo | null
  full: AssetFull | null
  error: string
  el: HTMLVideoElement | null
  ready: boolean
}
const sides = reactive<{ a: SideState; b: SideState }>({
  a: { asset: props.assets[0], info: null, full: null, error: '', el: null, ready: false },
  b: { asset: props.assets[1], info: null, full: null, error: '', el: null, ready: false }
})

const videoInfoOf = (s: 'a' | 'b') => sides[s].full?.videoInfo ?? null

async function loadSide(s: 'a' | 'b'): Promise<void> {
  try {
    sides[s].info = await window.mv.video.playInfo(sides[s].asset.id)
    if (sides[s].info?.tier === 'unsupported') {
      sides[s].error = sides[s].info.reason ?? '不支持播放'
    }
  } catch (e) {
    sides[s].error = (e as Error).message
  }
  try {
    sides[s].full = await window.mv.assets.get(sides[s].asset.id)
  } catch {
    /* 信息缺失不致命 */
  }
}
onMounted(() => {
  void loadSide('a')
  void loadSide('b')
})

// ---------- 显示顺序(盲测换位) ----------
// 逻辑侧固定 a/b(战绩按内容哈希),displayMap 决定显示在左/右
const swapped = ref(false) // true: b 在左
const blind = ref(true) // 盲测遮名
const leftSide = computed<'a' | 'b'>(() => (swapped.value ? 'b' : 'a'))
const rightSide = computed<'a' | 'b'>(() => (swapped.value ? 'a' : 'b'))

function displayName(s: 'a' | 'b'): string {
  if (blind.value && workflow.value === 'pick' && !revealing.value) return '???'
  return sides[s].asset.fileName
}

// ---------- 播放同步 ----------
// 基准:时长较短的一方
const refSide = computed<'a' | 'b'>(() => {
  const da = sides.a.asset.durationMs ?? Infinity
  const db = sides.b.asset.durationMs ?? Infinity
  return da <= db ? 'a' : 'b'
})
const refFps = computed(() => videoInfoOf(refSide.value)?.fps || 25)

const transport = reactive({
  playing: false,
  currentMs: 0,
  totalMs: 0,
  rate: 1,
  seeking: false
})

function readyEls(): HTMLVideoElement[] {
  return (['a', 'b'] as const)
    .map((s) => sides[s])
    .filter((st) => st.el && st.info?.tier !== 'unsupported' && !st.error)
    .map((st) => st.el!)
}

function onReady(s: 'a' | 'b'): void {
  sides[s].ready = true
  const els = readyEls()
  if (els.length === 2) {
    transport.totalMs = Math.min(...els.map((v) => v.duration * 1000))
    applyAudio()
  }
}

function togglePlay(): void {
  const els = readyEls()
  if (!els.length) return
  if (transport.playing) {
    els.forEach((v) => v.pause())
    transport.playing = false
  } else {
    els.forEach((v) => void v.play())
    transport.playing = true
  }
}

function seekTo(ms: number): void {
  transport.currentMs = ms
  readyEls().forEach((v) => {
    v.currentTime = Math.max(0, Math.min(ms / 1000, v.duration - 0.01))
  })
}

function stepFrame(delta: number): void {
  const t = transport.currentMs / 1000 + delta / refFps.value
  seekTo(Math.max(0, t * 1000))
}

function setRate(r: number): void {
  transport.rate = r
  readyEls().forEach((v) => (v.playbackRate = r))
}

function onTimeUpdate(): void {
  if (transport.seeking) return
  const el = sides[refSide.value].el
  if (el) transport.currentMs = el.currentTime * 1000
}

const currentFrame = computed(() => Math.round((transport.currentMs / 1000) * refFps.value) + 1)

// 操作任一侧镜像执行;偏差超过 0.15s 自动拉回
let driftTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  driftTimer = setInterval(() => {
    if (!transport.playing) return
    const els = readyEls()
    const ref = sides[refSide.value].el
    if (!ref) return
    const t = ref.currentTime
    for (const v of els) {
      if (v === ref) continue
      if (Math.abs(v.currentTime - t) > 0.15) {
        v.currentTime = Math.max(0, Math.min(t, v.duration - 0.01))
      }
    }
  }, 400)
})
onBeforeUnmount(() => {
  if (driftTimer) clearInterval(driftTimer)
  if (flicker.timer) clearInterval(flicker.timer)
})

// 音源:一键切换(仅并排模式生效,擦除/闪烁两侧保持静音)
const audioSide = ref<'a' | 'b'>('a')
function applyAudio(): void {
  for (const s of ['a', 'b'] as const) {
    const el = sides[s].el
    if (el) el.muted = mode.value !== 'side' || s !== audioSide.value
  }
}
watch([audioSide, mode], applyAudio)

// ---------- 缩放(框选同步放大) ----------
const pzA = usePanZoom(0.1, 32)
const pzB = usePanZoom(0.1, 32)
const engOf = (s: 'a' | 'b') => (s === 'a' ? pzA : pzB)
const paneEls = reactive<{ a: HTMLElement | null; b: HTMLElement | null }>({ a: null, b: null })

function fitBoth(): void {
  for (const s of ['a', 'b'] as const) {
    const el = paneEls[s]
    const v = sides[s].asset
    if (el) engOf(s).fit(el.clientWidth, el.clientHeight, v.width, v.height, 1)
  }
}

const zoomPct = computed(() => Math.round(pzA.pz.scale * 100))
const pixelated = computed(() => Math.max(pzA.pz.scale, pzB.pz.scale) >= 4)

let panning: { x: number; y: number; ta: { tx: number; ty: number }; tb: { tx: number; ty: number } } | null = null
function panDown(e: MouseEvent): void {
  if (e.button !== 0 || boxSel.active) return
  panning = {
    x: e.clientX,
    y: e.clientY,
    ta: { tx: pzA.pz.tx, ty: pzA.pz.ty },
    tb: { tx: pzB.pz.tx, ty: pzB.pz.ty }
  }
  window.addEventListener('mousemove', panMove)
  window.addEventListener('mouseup', panUp)
}
function panMove(e: MouseEvent): void {
  if (!panning) return
  const dx = e.clientX - panning.x
  const dy = e.clientY - panning.y
  // 两侧同步平移
  pzA.pz.tx = panning.ta.tx + dx
  pzA.pz.ty = panning.ta.ty + dy
  pzB.pz.tx = panning.tb.tx + dx
  pzB.pz.ty = panning.tb.ty + dy
}
function panUp(): void {
  panning = null
  window.removeEventListener('mousemove', panMove)
  window.removeEventListener('mouseup', panUp)
}

function wheelZoom(e: WheelEvent): void {
  e.preventDefault()
  const factor = e.deltaY < 0 ? 1.13 : 1 / 1.13
  const el = paneEls.a
  if (!el) return
  const rect = el.getBoundingClientRect()
  const w = el.clientWidth
  const h = el.clientHeight
  const a0 = pzA.pz.scale
  const b0 = pzB.pz.scale
  // A:以光标位置为锚点
  const px = e.clientX - rect.left
  const py = e.clientY - rect.top
  const ix = (px - w / 2 - pzA.pz.tx) / a0
  const iy = (py - h / 2 - pzA.pz.ty) / a0
  const a1 = Math.max(0.1, Math.min(32, a0 * factor))
  pzA.pz.scale = a1
  pzA.pz.tx = px - w / 2 - ix * a1
  pzA.pz.ty = py - h / 2 - iy * a1
  // B:同倍数,围绕各自画面中心
  const b1 = Math.max(0.1, Math.min(32, b0 * factor))
  pzB.pz.scale = b1
  pzB.pz.tx = (pzB.pz.tx * b1) / b0
  pzB.pz.ty = (pzB.pz.ty * b1) / b0
}

// ---------- 框选同步放大 ----------
const boxSel = reactive({
  active: false,
  drawing: false,
  x0: 0,
  y0: 0,
  x1: 0,
  y1: 0
})

function boxDown(e: MouseEvent): void {
  if (!boxSel.active || e.button !== 0) return
  const el = paneEls.a
  if (!el) return
  const rect = el.getBoundingClientRect()
  boxSel.drawing = true
  boxSel.x0 = boxSel.x1 = e.clientX - rect.left
  boxSel.y0 = boxSel.y1 = e.clientY - rect.top
  window.addEventListener('mousemove', boxMove)
  window.addEventListener('mouseup', boxUp)
}
function boxMove(e: MouseEvent): void {
  if (!boxSel.drawing) return
  const el = paneEls.a!
  const rect = el.getBoundingClientRect()
  boxSel.x1 = e.clientX - rect.left
  boxSel.y1 = e.clientY - rect.top
}
function boxUp(): void {
  if (!boxSel.drawing) return
  boxSel.drawing = false
  window.removeEventListener('mousemove', boxMove)
  window.removeEventListener('mouseup', boxUp)
  const el = paneEls.a!
  const x = Math.min(boxSel.x0, boxSel.x1)
  const y = Math.min(boxSel.y0, boxSel.y1)
  const w = Math.abs(boxSel.x1 - boxSel.x0)
  const h = Math.abs(boxSel.y1 - boxSel.y0)
  if (w < 6 || h < 6) return
  // pane 坐标 → 图像坐标(以左 pane 为准)
  const A = sides.a.asset
  const iw = A.width
  const ih = A.height
  const iwB = sides.b.asset.width
  const ihB = sides.b.asset.height
  const ix0 = (x - el.clientWidth / 2 - pzA.pz.tx) / pzA.pz.scale + iw / 2
  const iy0 = (y - el.clientHeight / 2 - pzA.pz.ty) / pzA.pz.scale + ih / 2
  const rw = w / pzA.pz.scale
  const rh = h / pzA.pz.scale
  pzA.zoomToRect(el.clientWidth, el.clientHeight, { x: ix0, y: iy0, w: rw, h: rh }, iw, ih)
  // B:同一中心同一倍数(按 B 的原始尺寸等比)
  const elB = paneEls.b
  if (elB) {
    const sB = Math.max(0.1, Math.min(32, pzA.pz.scale * (iw / iwB)))
    const cxB = (ix0 / iw) * iwB
    const cyB = (iy0 / ih) * ihB
    pzB.pz.scale = sB
    pzB.pz.tx = (iwB / 2 - cxB) * sB
    pzB.pz.ty = (ihB / 2 - cyB) * sB
  }
}
const boxRect = computed(() => ({
  left: Math.min(boxSel.x0, boxSel.x1) + 'px',
  top: Math.min(boxSel.y0, boxSel.y1) + 'px',
  width: Math.abs(boxSel.x1 - boxSel.x0) + 'px',
  height: Math.abs(boxSel.y1 - boxSel.y0) + 'px'
}))

// ---------- 擦除 / 闪烁 ----------
const wipePct = ref(50)
const flicker = reactive({ side: 'a' as 'a' | 'b', ms: 800, timer: 0 as number | null })
function restartFlicker(): void {
  if (flicker.timer) window.clearInterval(flicker.timer)
  flicker.timer = window.setInterval(() => {
    flicker.side = flicker.side === 'a' ? 'b' : 'a'
  }, Math.max(120, Math.min(2000, flicker.ms)))
}
watch(mode, (m) => {
  if (m === 'flicker') restartFlicker()
  else if (flicker.timer) {
    window.clearInterval(flicker.timer)
    flicker.timer = null
  }
  applyAudio()
})
onMounted(() => fitBoth())

// ---------- 盲测投票 ----------
const revealing = ref(false)
const lastWinner = ref<'a' | 'b' | null>(null)
const score = ref<PairScore>({ rounds: 0, aWins: 0, bWins: 0 })

async function refreshScore(): Promise<void> {
  try {
    score.value = await window.mv.compare.score(props.assets[0].id, props.assets[1].id)
  } catch {
    /* 忽略 */
  }
}
onMounted(() => void refreshScore())

function randomSwap(): void {
  swapped.value = Math.random() < 0.5
}

async function vote(displayWinner: 'left' | 'right'): Promise<void> {
  if (revealing.value) return
  // 显示侧 → 逻辑侧
  const winnerLogical: 'a' | 'b' = displayWinner === 'left' ? leftSide.value : rightSide.value
  lastWinner.value = winnerLogical
  revealing.value = true
  try {
    score.value = await window.mv.compare.vote(props.assets[0].id, props.assets[1].id, winnerLogical === 'a')
  } catch (e) {
    toast.error((e as Error).message)
  }
  // 揭晓 1.5 秒后换位进入下一轮
  setTimeout(() => {
    revealing.value = false
    randomSwap()
  }, 1500)
}

// ---------- 验收:PSNR / SSIM ----------
const quality = reactive<{ loading: boolean; report: QualityReport | null; error: string; metric: 'psnr' | 'ssim' }>({
  loading: false,
  report: null,
  error: '',
  metric: 'psnr'
})
// 验收:左侧固定参考片(默认 a),可对调
const acceptSwapped = ref(false)
const refDisplay = computed<'a' | 'b'>(() => (acceptSwapped.value ? 'b' : 'a'))

async function computeQuality(): Promise<void> {
  quality.loading = true
  quality.error = ''
  try {
    // 参考片 = 显示左侧(逻辑 refDisplay),被测 = 另一侧
    quality.report = await window.mv.compare.quality(
      sides[refDisplay.value].asset.id,
      sides[refDisplay.value === 'a' ? 'b' : 'a'].asset.id
    )
  } catch (e) {
    quality.error = (e as Error).message
  } finally {
    quality.loading = false
  }
}

function jumpToFrame(n: number): void {
  seekTo((n - 1) / (quality.report?.fps ?? refFps.value) * 1000)
}
function jumpToWorst(): void {
  if (quality.report) jumpToFrame(quality.report.worstFrame)
}

// ---------- 键盘 ----------
function onKey(e: KeyboardEvent): void {
  const t = e.target as HTMLElement
  if (t.tagName === 'INPUT' || t.tagName === 'SELECT') return
  if (workflow.value === 'pick' && !revealing.value && (e.key === '1' || e.key === '2')) {
    void vote(e.key === '1' ? 'left' : 'right')
  } else if (e.key === 'ArrowLeft') {
    stepFrame(-1)
  } else if (e.key === 'ArrowRight') {
    stepFrame(1)
  } else if (e.key === ' ') {
    e.preventDefault()
    togglePlay()
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

const progressPct = computed(() => (transport.totalMs ? (transport.currentMs / transport.totalMs) * 100 : 0))

function barDown(e: MouseEvent): void {
  transport.seeking = true
  barMove(e)
  const move = (ev: MouseEvent): void => barMove(ev)
  const up = (): void => {
    transport.seeking = false
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', up)
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}
function barMove(e: MouseEvent): void {
  const el = e.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  seekTo(pct * transport.totalMs)
}

// 信息条
function infoRows(s: 'a' | 'b'): { k: string; v: string }[] {
  const info = videoInfoOf(s)
  const a = sides[s].asset
  const rows = [
    { k: '分辨率', v: info ? `${info.width}×${info.height}` : `${a.width}×${a.height}` },
    { k: '帧率', v: info?.fps ? `${info.fps} fps` : '-' },
    { k: '时长', v: fmtDuration(a.durationMs ?? 0) },
    { k: '码率', v: info?.bitrate ? `${(info.bitrate / 1000).toFixed(0)} kbps` : '-' },
    { k: '大小', v: fmtBytes(a.fileSize) },
    { k: '编码', v: (info?.videoCodec ?? '?').toUpperCase() }
  ]
  if (info && !info.hasAudio) rows.push({ k: '音轨', v: '无音轨' })
  return rows
}
</script>

<template>
  <div class="dvc">
    <!-- 工具条 -->
    <div class="cw-toolbar">
      <div class="mode-tabs">
        <button class="mode-tab" :class="{ active: workflow === 'pick' }" title="不同模型出片二选一" @click="workflow = 'pick'">挑选 · 盲测投票</button>
        <button class="mode-tab" :class="{ active: workflow === 'accept' }" title="超分/插帧质检:逐帧对比 + 客观指标" @click="workflow = 'accept'">验收 · 质量指标</button>
      </div>
      <span class="tb-sep" />
      <div class="mode-tabs">
        <button class="mode-tab" :class="{ active: mode === 'side' }" @click="mode = 'side'">并排</button>
        <button class="mode-tab" :class="{ active: mode === 'wipe' }" @click="mode = 'wipe'">擦除</button>
        <button class="mode-tab" :class="{ active: mode === 'flicker' }" @click="mode = 'flicker'">闪烁</button>
      </div>
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
      <span class="zoom-label">{{ zoomPct }}%</span>
      <button class="tool-btn" title="适应窗口" @click="fitBoth"><Icon name="arrowsOut" :size="13" /></button>
      <button class="tool-btn" :class="{ on: boxSel.active }" title="框选同步放大(最大 32 倍,像素级)" @click="boxSel.active = !boxSel.active">
        <Icon name="crop" :size="13" /> 框选放大
      </button>
      <template v-if="workflow === 'pick'">
        <button class="tool-btn" :class="{ on: blind }" @click="blind = !blind">
          <Icon name="eye" :size="13" /> {{ blind ? '盲测中' : '已揭晓' }}
        </button>
      </template>
      <template v-else>
        <button class="tool-btn" title="对调参考片 / 被测片" @click="acceptSwapped = !acceptSwapped">
          <Icon name="flip" :size="13" /> {{ acceptSwapped ? '右为参考' : '左为参考' }}
        </button>
      </template>
    </div>

    <!-- 画面区 -->
    <div class="cw-stage">
      <!-- 并排 -->
      <div v-if="mode === 'side'" class="side-wrap">
        <div
          v-for="pos in ['left', 'right'] as const"
          :key="pos"
          class="pane-col"
        >
          <div
            v-for="s in [pos === 'left' ? leftSide : rightSide]"
            :key="s"
          >
            <div
              :ref="(el) => (paneEls[s] = el as HTMLElement)"
              class="pane"
              @wheel="wheelZoom($event)"
              @mousedown="panDown($event)"
              @mousedown.capture="boxDown($event)"
            >
              <div v-if="sides[s].error" class="pane-err">{{ sides[s].error }}</div>
              <video
                v-else
                :ref="(el) => (sides[s].el = el as HTMLVideoElement)"
                :src="sides[s].info?.url ?? ''"
                class="view"
                :class="{ pixelated }"
                :style="pzStyle(engOf(s).pz)"
                playsinline
                preload="auto"
                @loadedmetadata="onReady(s)"
                @timeupdate="onTimeUpdate"
              />
              <div v-if="boxSel.active && s === 'a'" class="pane hint-cursor">
                <div v-if="boxSel.drawing" class="box-rect" :style="boxRect" />
              </div>
              <span v-if="lastWinner === s && revealing" class="win-badge">✓ 本轮胜出</span>
            </div>
            <!-- 每侧媒体信息 -->
            <div class="side-info">
              <span class="si-name" :class="{ blind: blind && workflow === 'pick' && !revealing }">
                {{ pos === 'left' ? '左' : '右' }} · {{ displayName(s) }}
              </span>
              <span v-if="sides[s].info?.tier === 'remux'" class="remux-badge" title="已自动转封装(不改动原文件)">转封装</span>
              <span class="si-meta">
                {{ infoRows(s).map((r) => `${r.k} ${r.v}`).join(' · ') }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 擦除:视频版 -->
      <div v-else-if="mode === 'wipe'" class="wipe-wrap">
        <div ref="paneEls.a" class="pane wipe-pane" @wheel="wheelZoom($event)" @mousedown="panDown($event)">
          <video
            :ref="(el) => (sides.a.el = el as HTMLVideoElement)"
            :src="sides.a.info?.url ?? ''"
            class="view"
            :class="{ pixelated }"
            :style="pzStyle(pzA.pz)"
            playsinline
            preload="auto"
            muted
            @loadedmetadata="onReady('a')"
            @timeupdate="onTimeUpdate"
          />
          <div class="wipe-clip" :style="{ clipPath: `inset(0 0 0 ${wipePct}%)` }">
            <video
              :src="sides.b.info?.url ?? ''"
              class="view"
              :class="{ pixelated }"
              :style="pzStyle(pzA.pz)"
              playsinline
              preload="auto"
              muted
              @timeupdate="onTimeUpdate"
            />
          </div>
          <div class="divider" :style="{ left: wipePct + '%' }">
            <span class="divider-grip" />
          </div>
        </div>
        <div class="wipe-labels">
          <span>左:{{ displayName('a') }}</span>
          <span>右:{{ displayName('b') }}</span>
        </div>
      </div>

      <!-- 闪烁:视频版 -->
      <div v-else class="flicker-wrap">
        <div ref="paneEls.a" class="pane" @wheel="wheelZoom($event)" @mousedown="panDown($event)">
          <video
            v-show="flicker.side === 'a'"
            :ref="(el) => (sides.a.el = el as HTMLVideoElement)"
            :src="sides.a.info?.url ?? ''"
            class="view"
            :class="{ pixelated }"
            :style="pzStyle(pzA.pz)"
            playsinline
            preload="auto"
            muted
            @loadedmetadata="onReady('a')"
            @timeupdate="onTimeUpdate"
          />
          <video
            v-show="flicker.side === 'b'"
            :ref="(el) => (sides.b.el = el as HTMLVideoElement)"
            :src="sides.b.info?.url ?? ''"
            class="view"
            :class="{ pixelated }"
            :style="pzStyle(pzA.pz)"
            playsinline
            preload="auto"
            muted
            @loadedmetadata="onReady('b')"
            @timeupdate="onTimeUpdate"
          />
        </div>
        <div class="flicker-label" :class="flicker.side">
          当前显示:{{ flicker.side === 'a' ? displayName('a') : displayName('b') }}
        </div>
      </div>

      <!-- 验收:质量曲线 -->
      <div v-if="workflow === 'accept'" class="quality-panel">
        <div class="qp-head">
          <span class="qp-title">
            <Icon name="scan" :size="13" />
            逐帧质量曲线
          </span>
          <div class="mode-tabs sm">
            <button class="mode-tab" :class="{ active: quality.metric === 'psnr' }" @click="quality.metric = 'psnr'">PSNR</button>
            <button class="mode-tab" :class="{ active: quality.metric === 'ssim' }" @click="quality.metric = 'ssim'">SSIM</button>
          </div>
          <button class="tool-btn" :disabled="quality.loading" @click="computeQuality">
            <Icon name="refresh" :size="12" /> {{ quality.loading ? '分析中…' : quality.report ? '重新分析' : '开始分析' }}
          </button>
          <button v-if="quality.report" class="tool-btn" @click="jumpToWorst">
            <Icon name="warning" :size="12" /> 跳到最差帧 #{{ quality.report.worstFrame }}
          </button>
          <div style="flex: 1" />
          <span v-if="quality.report" class="qp-sum">
            平均 PSNR {{ quality.report.avgPsnr }}dB · 最差 {{ quality.report.worstPsnr }}dB · 平均 SSIM {{ quality.report.avgSsim }} · 最差 {{ quality.report.worstSsim }}
          </span>
        </div>
        <div v-if="quality.error" class="qp-error">{{ quality.error }}</div>
        <div v-if="quality.report?.durationMismatch" class="qp-warn">
          <Icon name="warning" :size="12" /> 两段视频时长不匹配,指标以较短一方为准
        </div>
        <QualityChart
          v-if="quality.report"
          :report="quality.report"
          :metric="quality.metric"
          :current-frame="currentFrame"
          class="qp-chart"
          @seek="jumpToFrame"
        />
        <div v-else-if="!quality.loading && !quality.error" class="qp-hint">
          点击「开始分析」逐帧计算 PSNR / SSIM(参考片 = {{ acceptSwapped ? '右' : '左' }}侧);曲线可点击跳转
        </div>
        <div v-if="quality.report?.note" class="qp-note">{{ quality.report.note }}</div>
      </div>
    </div>

    <!-- 公共播放栏 -->
    <div class="transport">
      <button class="tr-btn" title="上一帧(按参考片帧率)" @click="stepFrame(-1)">
        <Icon name="rotate-l" :size="14" />
      </button>
      <button class="tr-btn" title="下一帧" @click="stepFrame(1)">
        <Icon name="rotate-r" :size="14" />
      </button>
      <button class="tr-btn" :title="transport.playing ? '暂停' : '播放(空格)'" @click="togglePlay">
        <Icon :name="transport.playing ? 'pause' : 'play'" :size="16" filled />
      </button>
      <span class="tr-time">
        {{ (transport.currentMs / 1000).toFixed(2) }}s / {{ (transport.totalMs / 1000).toFixed(2) }}s
        · 第 {{ currentFrame }} 帧
      </span>
      <div class="tr-bar" @mousedown="barDown">
        <div class="tr-progress" :style="{ width: progressPct + '%' }" />
      </div>
      <select class="tr-select" title="倍速" @change="setRate(Number(($event.target as HTMLSelectElement).value))">
        <option value="0.5">0.5×</option>
        <option value="1" selected>1×</option>
        <option value="1.5">1.5×</option>
        <option value="2">2×</option>
      </select>
      <button class="tool-btn" title="切换音源" @click="audioSide = audioSide === 'a' ? 'b' : 'a'; applyAudio()">
        <Icon name="volume" :size="13" /> 听{{ audioSide === 'a' ? (swapped ? '右' : '左') : (swapped ? '左' : '右') }}
      </button>
    </div>

    <!-- 盲测投票栏(挑选模式) -->
    <div v-if="workflow === 'pick'" class="vote-bar">
      <button class="vote-btn left" :disabled="revealing" @click="vote('left')">
        ← 左边更好 <kbd>1</kbd>
      </button>
      <div class="vote-score">
        <template v-if="score.rounds > 0">
          <span :class="{ win: score.aWins > score.bWins }">{{ displayName('a') }} {{ score.aWins }}</span>
          <span class="vs">vs</span>
          <span :class="{ win: score.bWins > score.aWins }">{{ score.bWins }} {{ displayName('b') }}</span>
          <span class="rounds">共 {{ score.rounds }} 轮(按文件内容长期保存)</span>
        </template>
        <span v-else class="rounds">这对视频还没有对战国记录,投出第一票吧</span>
      </div>
      <button class="vote-btn right" :disabled="revealing" @click="vote('right')">
        <kbd>2</kbd> 右边更好 →
      </button>
    </div>
  </div>
</template>

<style scoped>
.dvc {
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
.mode-tabs.sm .mode-tab {
  padding: 4px 10px;
  font-size: 11.5px;
}
.mode-tab {
  padding: 6px 12px;
  border-radius: 7px;
  font-size: 12.5px;
  color: var(--text-dim);
  white-space: nowrap;
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
  white-space: nowrap;
}
.tool-btn.on {
  color: #a9c0ff;
  background: var(--accent-soft);
}
.zoom-label {
  font-size: 12px;
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
}
.wipe-slider {
  width: 120px;
}
.cw-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--viewer-bg, #111113);
  overflow: hidden;
}
.side-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 6px;
  padding: 6px;
}
.pane-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.pane-col > div {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.pane {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.35);
  border-radius: 6px;
  cursor: grab;
}
.pane:active {
  cursor: grabbing;
}
.pane.hint-cursor {
  cursor: crosshair;
  background: transparent;
  pointer-events: none;
  border-radius: 0;
  position: absolute;
  inset: 0;
}
.view {
  position: absolute;
  left: 50%;
  top: 50%;
  max-width: none;
  max-height: none;
  user-select: none;
  pointer-events: none;
  will-change: transform;
}
.view.pixelated {
  image-rendering: pixelated;
}
.pane-err {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--danger);
  font-size: 12.5px;
  padding: 20px;
  text-align: center;
}
.side-info {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--text-faint);
  padding: 2px 4px;
  min-width: 0;
}
.si-name {
  color: var(--text-dim);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 42%;
}
.si-name.blind {
  color: var(--warn);
}
.si-meta {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.remux-badge {
  flex: none;
  font-size: 10px;
  color: var(--warn);
  background: rgba(255, 180, 77, 0.14);
  border: 1px solid rgba(255, 180, 77, 0.4);
  border-radius: 4px;
  padding: 1px 6px;
}
.win-badge {
  position: absolute;
  right: 10px;
  top: 10px;
  font-size: 12px;
  color: var(--ok);
  background: rgba(77, 216, 130, 0.18);
  border: 1px solid rgba(77, 216, 130, 0.5);
  border-radius: 6px;
  padding: 3px 10px;
  pointer-events: none;
}

/* 擦除 / 闪烁 */
.wipe-wrap,
.flicker-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 6px;
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
.flicker-label {
  align-self: center;
  margin-top: 6px;
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  max-width: 80%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.flicker-label.b {
  background: var(--accent-soft);
  color: #a9c0ff;
}
.box-rect {
  position: absolute;
  border: 1.5px dashed rgba(79, 124, 255, 0.9);
  background: rgba(79, 124, 255, 0.1);
  pointer-events: none;
}

/* 质量面板 */
.quality-panel {
  flex: none;
  height: 190px;
  border-top: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  padding: 6px 12px 8px;
}
.qp-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.qp-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: var(--text-dim);
}
.qp-sum {
  font-size: 11.5px;
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
}
.qp-chart {
  flex: 1;
  min-height: 0;
  margin-top: 4px;
}
.qp-hint,
.qp-note {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-faint);
  font-size: 12px;
}
.qp-note {
  flex: none;
  font-size: 11px;
  color: var(--warn);
  padding-top: 4px;
}
.qp-error {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--danger);
  font-size: 12px;
}
.qp-warn {
  font-size: 11px;
  color: var(--warn);
  display: flex;
  align-items: center;
  gap: 5px;
  padding-top: 2px;
}

/* 播放栏 / 投票栏 */
.transport {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  border-top: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.25);
}
.tr-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  color: var(--text);
}
.tr-btn:hover {
  background: var(--bg-glass-strong);
}
.tr-time {
  font-size: 12px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
  flex: none;
  white-space: nowrap;
}
.tr-bar {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.14);
  cursor: pointer;
}
.tr-progress {
  height: 100%;
  border-radius: 3px;
  background: var(--accent);
}
.tr-select {
  font-size: 12px;
  background: var(--bg-glass);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-dim);
  padding: 4px 6px;
}
.vote-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 16px;
  border-top: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.3);
}
.vote-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 18px;
  border-radius: 9px;
  font-size: 13px;
  background: var(--bg-glass-strong);
  border: 1px solid var(--border-strong);
  color: var(--text);
}
.vote-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: #a9c0ff;
}
.vote-btn:disabled {
  opacity: 0.5;
}
.vote-score {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-size: 12.5px;
  color: var(--text-dim);
  min-width: 0;
  overflow: hidden;
}
.vote-score .win {
  color: var(--ok);
  font-weight: 600;
}
.vote-score .vs {
  color: var(--text-faint);
  font-size: 11px;
}
.vote-score .rounds {
  font-size: 11px;
  color: var(--text-faint);
  white-space: nowrap;
}
</style>
