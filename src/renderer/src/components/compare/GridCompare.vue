<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type { Asset, PlayInfo } from '@sh/types'
import { useToastStore } from '../../stores/toast'
import { sourceUrl, thumbUrl, fmtDuration } from '../../util/format'
import Icon from '../Icon.vue'
import { usePanZoom, pzStyle } from './usePanZoom'

const props = defineProps<{ assets: Asset[] }>()

const toast = useToastStore()

// ---------- 宫格档位 ----------
const GRID_OPTIONS = [4, 6, 9] as const
const gridSize = ref(6)
const availableGrids = computed(() => GRID_OPTIONS.filter((n) => n >= props.assets.length))
watch(
  () => props.assets.length,
  () => {
    if (!availableGrids.value.includes(gridSize.value as 4 | 6 | 9)) {
      gridSize.value = availableGrids.value[0] ?? 9
    }
  },
  { immediate: true }
)
const gridClass = computed(() => `g${gridSize.value}`)

// ---------- 缩放平移 ----------
const sync = ref(true)
const shared = usePanZoom(0.1, 16)
const cellPzs = reactive(props.assets.map(() => usePanZoom(0.1, 16)))

interface CellState {
  el: HTMLElement | null
  natW: number
  natH: number
}
const cells = reactive<CellState[]>(props.assets.map(() => ({ el: null, natW: 0, natH: 0 })))

function cellWheel(i: number, e: WheelEvent): void {
  e.preventDefault()
  const c = cells[i]
  if (!c.el) return
  const rect = c.el.getBoundingClientRect()
  const factor = e.deltaY < 0 ? 1.13 : 1 / 1.13
  if (sync.value) {
    // 同步:每格按相同相对位置锚点缩放
    for (const cc of cells) {
      if (!cc.el) continue
      const r = cc.el.getBoundingClientRect()
      shared.zoomAt(
        r.width,
        r.height,
        ((e.clientX - rect.left) / rect.width) * r.width,
        ((e.clientY - rect.top) / rect.height) * r.height,
        factor
      )
    }
  } else {
    cellPzs[i].zoomAt(rect.width, rect.height, e.clientX - rect.left, e.clientY - rect.top, factor)
  }
}

let panState: { i: number; x: number; y: number; tx: number; ty: number } | null = null
function panDown(i: number, e: MouseEvent): void {
  if (e.button !== 0) return
  const pz = sync.value ? shared.pz : cellPzs[i].pz
  panState = { i, x: e.clientX, y: e.clientY, tx: pz.tx, ty: pz.ty }
  window.addEventListener('mousemove', panMove)
  window.addEventListener('mouseup', panUp)
}
function panMove(e: MouseEvent): void {
  if (!panState) return
  const pz = sync.value ? shared.pz : cellPzs[panState.i].pz
  pz.tx = panState.tx + (e.clientX - panState.x)
  pz.ty = panState.ty + (e.clientY - panState.y)
}
function panUp(): void {
  panState = null
  window.removeEventListener('mousemove', panMove)
  window.removeEventListener('mouseup', panUp)
}

function fitAll(): void {
  for (const c of cells) {
    if (!c.el || !c.natW) continue
    shared.fit(c.el.clientWidth, c.el.clientHeight, c.natW, c.natH)
    break
  }
  props.assets.forEach((_a, i) => {
    const c = cells[i]
    if (c?.el && c.natW) cellPzs[i].fit(c.el.clientWidth, c.el.clientHeight, c.natW, c.natH)
  })
}

const zoomPct = computed(() => Math.round(shared.pz.scale * 100))

// ---------- 视频同步播放 ----------
const videoAssets = computed(() => props.assets.filter((a) => a.kind === 'video'))
const hasVideo = computed(() => videoAssets.value.length > 0)

interface VideoCell {
  asset: Asset
  info: PlayInfo | null
  error: string
  ready: boolean
}
const videoInfos = reactive<VideoCell[]>(
  props.assets.map((a) => ({ asset: a, info: null, error: '', ready: false }))
)

async function loadVideoInfos(): Promise<void> {
  for (const v of videoInfos) {
    if (v.asset.kind !== 'video') continue
    try {
      v.info = await window.mv.video.playInfo(v.asset.id)
    } catch (e) {
      v.error = (e as Error).message
    }
  }
}
onMounted(() => {
  if (hasVideo.value) void loadVideoInfos()
})

const videoEls = reactive<(HTMLVideoElement | null)[]>(props.assets.map(() => null))

// 最短时长为基准
const refIndex = computed(() => {
  let idx = -1
  let minDur = Infinity
  props.assets.forEach((a, i) => {
    if (a.kind === 'video' && a.durationMs && a.durationMs < minDur) {
      minDur = a.durationMs
      idx = i
    }
  })
  return idx
})

const transport = reactive({
  playing: false,
  currentMs: 0,
  totalMs: 0,
  rate: 1,
  audioCell: -1, // -2 全体静音, -1 默认(第一个视频), 其他=格子序号
  seeking: false
})

function readyVideos(): HTMLVideoElement[] {
  return videoEls
    .map((v, i) => ({ v, i }))
    .filter(({ v, i }) => v && videoInfos[i].info?.tier !== 'unsupported' && !videoInfos[i].error)
    .map(({ v }) => v!)
}

function onVideoReady(i: number): void {
  videoInfos[i].ready = true
  const vids = readyVideos()
  if (vids.length) {
    transport.totalMs = Math.min(...vids.map((v) => v.duration * 1000))
  }
  applyAudio()
}

function togglePlay(): void {
  const vids = readyVideos()
  if (!vids.length) return
  if (transport.playing) {
    vids.forEach((v) => v.pause())
    transport.playing = false
  } else {
    vids.forEach((v) => void v.play())
    transport.playing = true
  }
}

function seekTo(ms: number): void {
  transport.currentMs = ms
  readyVideos().forEach((v) => {
    v.currentTime = Math.min(ms / 1000, Math.max(0, v.duration - 0.01))
  })
}

function setRate(r: number): void {
  transport.rate = r
  readyVideos().forEach((v) => (v.playbackRate = r))
}

function applyAudio(): void {
  props.assets.forEach((_a, i) => {
    const v = videoEls[i]
    if (!v) return
    v.muted = transport.audioCell === -2 || transport.audioCell !== i
  })
}

function onTimeUpdate(): void {
  if (transport.seeking) return
  const ref = videoEls[refIndex.value]
  if (ref) transport.currentMs = ref.currentTime * 1000
}

// 偏差超过 0.15 秒自动校正
let driftTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  driftTimer = setInterval(() => {
    if (!transport.playing) return
    const vids = readyVideos()
    const ref = videoEls[refIndex.value]
    if (!ref) return
    const t = ref.currentTime
    for (const v of vids) {
      if (v === ref) continue
      if (Math.abs(v.currentTime - t) > 0.15) {
        v.currentTime = Math.min(t, Math.max(0, v.duration - 0.01))
      }
    }
  }, 500)
})
onBeforeUnmount(() => {
  if (driftTimer) clearInterval(driftTimer)
})

function onVideoError(i: number): void {
  // 某一格播放失败只影响该格
  videoInfos[i].error = '该视频播放失败'
}

// 进度条拖拽
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

const progressPct = computed(() => (transport.totalMs ? (transport.currentMs / transport.totalMs) * 100 : 0))

// 视频/图片通用:图片 onload 记录尺寸
function imgLoad(i: number, e: Event): void {
  const img = e.target as HTMLImageElement
  cells[i].natW = img.naturalWidth
  cells[i].natH = img.naturalHeight
  if (i === 0) fitAll()
}
</script>

<template>
  <div class="grid-cw">
    <!-- 工具条 -->
    <div class="cw-toolbar">
      <div class="mode-tabs">
        <button
          v-for="n in availableGrids"
          :key="n"
          class="mode-tab"
          :class="{ active: gridSize === n }"
          @click="gridSize = n"
        >
          {{ n }} 宫格
        </button>
      </div>
      <span class="tb-sep" />
      <button class="tool-btn" :class="{ on: sync }" @click="sync = !sync">
        <Icon :name="sync ? 'compare' : 'x'" :size="13" />
        {{ sync ? '同步缩放拖动' : '各自独立' }}
      </button>
      <span class="zoom-label">{{ zoomPct }}%</span>
      <button class="tool-btn" title="适应窗口" @click="fitAll"><Icon name="arrowsOut" :size="13" /></button>
    </div>

    <!-- 宫格 -->
    <div :class="['cw-stage', gridClass]">
      <template v-for="(a, i) in assets" :key="a.id">
        <div
          :ref="(el) => (cells[i].el = el as HTMLElement)"
          class="cell"
          @wheel="cellWheel(i, $event)"
          @mousedown="panDown(i, $event)"
        >
          <img
            v-if="a.kind === 'image'"
            :src="sourceUrl(a)"
            class="view"
            :style="pzStyle(sync ? shared.pz : cellPzs[i].pz)"
            draggable="false"
            alt=""
            @load="imgLoad(i, $event)"
          />
          <template v-else>
            <div v-if="videoInfos[i].error" class="cell-err">
              <Icon name="warning" :size="20" />
              <span>{{ videoInfos[i].error }}</span>
            </div>
            <div v-else-if="videoInfos[i].info?.tier === 'unsupported'" class="cell-err">
              <Icon name="warning" :size="20" />
              <span>{{ videoInfos[i].info?.reason }}</span>
            </div>
            <video
              v-else
              :ref="(el) => (videoEls[i] = el as HTMLVideoElement)"
              :src="videoInfos[i].info?.url ?? ''"
              class="view vid"
              :style="pzStyle(sync ? shared.pz : cellPzs[i].pz)"
              playsinline
              preload="auto"
              @loadedmetadata="onVideoReady(i)"
              @error="onVideoError(i)"
              @timeupdate="onTimeUpdate"
            />
            <span v-if="videoInfos[i].info?.tier === 'remux'" class="remux-badge" title="已自动转封装(不改动原文件)">转封装</span>
          </template>
          <span class="cell-tag">{{ i + 1 }} · {{ a.fileName }}</span>
        </div>
      </template>
      <!-- 空位占位 -->
      <div v-for="n in gridSize - assets.length" :key="'empty' + n" class="cell empty">
        <Icon name="image" :size="22" />
        <span>空位</span>
      </div>
    </div>

    <!-- 视频公共播放栏 -->
    <div v-if="hasVideo" class="transport">
      <button class="tr-btn" @click="togglePlay">
        <Icon :name="transport.playing ? 'pause' : 'play'" :size="15" filled />
      </button>
      <span class="tr-time">{{ (transport.currentMs / 1000).toFixed(2) }}s / {{ (transport.totalMs / 1000).toFixed(2) }}s</span>
      <div class="tr-bar" @mousedown="barDown">
        <div class="tr-progress" :style="{ width: progressPct + '%' }" />
      </div>
      <select
        class="tr-select"
        title="倍速"
        @change="setRate(Number(($event.target as HTMLSelectElement).value))"
      >
        <option value="0.5">0.5×</option>
        <option value="1" selected>1×</option>
        <option value="1.5">1.5×</option>
        <option value="2">2×</option>
      </select>
      <select
        class="tr-select"
        title="音源:选择听哪一格"
        @change="transport.audioCell = Number(($event.target as HTMLSelectElement).value); applyAudio()"
      >
        <option :value="-1">音源:自动</option>
        <option :value="-2">整体静音</option>
        <option v-for="(a, i) in assets.filter((x) => x.kind === 'video')" :key="a.id" :value="assets.indexOf(a)">
          格 {{ assets.indexOf(a) + 1 }}
        </option>
      </select>
    </div>
  </div>
</template>

<style scoped>
.grid-cw {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.cw-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
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
.tool-btn.on {
  color: #a9c0ff;
  background: var(--accent-soft);
}
.zoom-label {
  font-size: 12px;
  color: var(--text-faint);
  min-width: 44px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.cw-stage {
  flex: 1;
  min-height: 0;
  display: grid;
  gap: 4px;
  padding: 6px;
  background: var(--viewer-bg, #111113);
}
.cw-stage.g4 {
  grid-template-columns: 1fr 1fr;
}
.cw-stage.g6 {
  grid-template-columns: repeat(3, 1fr);
}
.cw-stage.g9 {
  grid-template-columns: repeat(3, 1fr);
}
.cell {
  position: relative;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 6px;
  cursor: grab;
  min-height: 0;
}
.cell:active {
  cursor: grabbing;
}
.cell.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--text-faint);
  font-size: 11.5px;
  border: 1px dashed var(--border-strong);
  cursor: default;
}
.view {
  position: absolute;
  max-width: none;
  max-height: none;
  user-select: none;
  pointer-events: none;
  will-change: transform;
}
.view.vid {
  pointer-events: none;
}
.cell-err {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-faint);
  font-size: 11.5px;
  padding: 12px;
  text-align: center;
}
.cell-tag {
  position: absolute;
  left: 6px;
  top: 6px;
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.78);
  background: rgba(0, 0, 0, 0.55);
  border-radius: 4px;
  padding: 2px 7px;
  max-width: 85%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}
.remux-badge {
  position: absolute;
  right: 6px;
  top: 6px;
  font-size: 10px;
  color: var(--warn);
  background: rgba(255, 180, 77, 0.14);
  border: 1px solid rgba(255, 180, 77, 0.4);
  border-radius: 4px;
  padding: 1px 6px;
  pointer-events: none;
}
.transport {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 16px;
  border-top: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.25);
}
.tr-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
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
}
.tr-bar {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.14);
  cursor: pointer;
  position: relative;
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
</style>
