<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Asset, PlayInfo } from '@sh/types'
import { useToastStore } from '../stores/toast'
import { fmtDuration } from '../util/format'
import Icon from './Icon.vue'

const props = defineProps<{ asset: Asset }>()

const toast = useToastStore()

const videoEl = ref<HTMLVideoElement | null>(null)
const state = ref<'loading' | 'remuxing' | 'ready' | 'error' | 'unsupported'>('loading')
const playInfo = ref<PlayInfo | null>(null)
const errorMsg = ref('')
const playing = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const volume = ref(1)
const muted = ref(false)
const seeking = ref(false)

let playingPath: string | null = null

async function load(): Promise<void> {
  state.value = 'loading'
  errorMsg.value = ''
  // mkv/avi 大概率需要转封装,等待期间先给出对应提示
  if (['mkv', 'avi'].includes(props.asset.ext)) state.value = 'remuxing'
  const id = props.asset.id
  try {
    const info = await window.mv.video.playInfo(id)
    // 防止切换后的旧结果
    if (props.asset.id !== id) return
    playInfo.value = info
    if (info.tier === 'unsupported') {
      state.value = 'unsupported'
      return
    }
    state.value = 'ready'
  } catch (e) {
    state.value = 'error'
    errorMsg.value = (e as Error).message
  }
}

watch(
  () => props.asset.id,
  () => {
    void notifyPlaying(false)
    void load()
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  void notifyPlaying(false)
})

async function notifyPlaying(on: boolean): Promise<void> {
  const p = playingPath ?? playInfo.value?.url ?? ''
  if (!p) return
  if (on && !playingPath) playingPath = p
  if (!on) playingPath = null
  const realPath = decodeURIComponent(p.replace(/^mvfile:\/\/f\//, ''))
  await window.mv.video.playing(realPath, on).catch(() => {})
}

function onLoadedMetadata(): void {
  const v = videoEl.value
  if (!v) return
  duration.value = v.duration * 1000
  void v.play().catch(() => {})
  void notifyPlaying(true)
}

function onTimeUpdate(): void {
  const v = videoEl.value
  if (!v || seeking.value) return
  currentTime.value = v.currentTime * 1000
}

function togglePlay(): void {
  const v = videoEl.value
  if (!v) return
  if (v.paused) void v.play()
  else v.pause()
}

function onPlay(): void {
  playing.value = true
  void notifyPlaying(true)
}
function onPause(): void {
  playing.value = false
  // 暂停中的视频同样受保护,不取消注销
}
function onVideoError(): void {
  const v = videoEl.value
  const code = v?.error?.code
  const map: Record<number, string> = {
    1: '加载被中断',
    2: '网络错误',
    3: '解码失败(编码可能不受支持)',
    4: '不支持该视频源',
  }
  state.value = 'error'
  errorMsg.value = map[code ?? 0] ?? '视频加载失败'
}

function seekTo(ms: number): void {
  const v = videoEl.value
  if (!v) return
  currentTime.value = ms
  v.currentTime = ms / 1000
}

function setVolume(v: number): void {
  volume.value = v
  muted.value = v === 0
  if (videoEl.value) {
    videoEl.value.volume = v
    videoEl.value.muted = v === 0
  }
}

function toggleMute(): void {
  setVolume(muted.value ? 0.6 : 0)
}

const progressPct = computed(() => (duration.value ? (currentTime.value / duration.value) * 100 : 0))
const currentSrc = computed(() => playInfo.value?.url ?? '')

function barClick(e: MouseEvent): void {
  const el = e.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  const pct = (e.clientX - rect.left) / rect.width
  seekTo(pct * duration.value)
}

let dragging = false
function barDown(e: MouseEvent): void {
  dragging = true
  seeking.value = true
  barClick(e)
  const move = (ev: MouseEvent): void => barClick(ev)
  const up = (): void => {
    dragging = false
    seeking.value = false
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', up)
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}
</script>

<template>
  <div class="video-player">
    <div v-if="state === 'loading' || state === 'remuxing'" class="vp-center">
      <div class="spinner" />
      <span>{{ state === 'remuxing' ? '正在转封装为可播放格式…' : '正在加载视频…' }}</span>
    </div>
    <div v-else-if="state === 'unsupported'" class="vp-center">
      <Icon name="warning" :size="30" />
      <span class="vp-unsupported">不支持播放</span>
      <span class="vp-reason">{{ playInfo?.reason }}</span>
    </div>
    <div v-else-if="state === 'error'" class="vp-center">
      <Icon name="warning" :size="30" />
      <span class="vp-unsupported">视频加载失败</span>
      <span class="vp-reason">{{ errorMsg }}</span>
    </div>

    <video
      v-show="state === 'ready'"
      ref="videoEl"
      :src="currentSrc"
      loop
      autoplay
      playsinline
      @loadedmetadata="onLoadedMetadata"
      @timeupdate="onTimeUpdate"
      @play="onPlay"
      @pause="onPause"
      @error="onVideoError"
      @click="togglePlay"
    />

    <div v-if="state === 'ready'" class="vp-controls">
      <button class="vc-btn" :title="playing ? '暂停' : '播放'" @click="togglePlay">
        <Icon :name="playing ? 'pause' : 'play'" :size="16" filled />
      </button>
      <span class="vc-time">{{ fmtDuration(currentTime) }}</span>
      <div class="vc-bar" @mousedown="barDown" @click="barClick">
        <div class="vc-progress" :style="{ width: progressPct + '%' }" />
        <div class="vc-thumb" :style="{ left: progressPct + '%' }" />
      </div>
      <span class="vc-time">{{ fmtDuration(duration) }}</span>
      <button class="vc-btn" :title="muted ? '取消静音' : '静音'" @click="toggleMute">
        <Icon :name="muted ? 'mute' : 'volume'" :size="16" />
      </button>
      <input
        class="vc-vol"
        type="range"
        min="0"
        max="1"
        step="0.05"
        :value="muted ? 0 : volume"
        title="音量"
        @input="setVolume(Number(($event.target as HTMLInputElement).value))"
      />
    </div>
  </div>
</template>

<style scoped>
.video-player {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: #000;
}
video {
  flex: 1;
  min-height: 0;
  width: 100%;
  object-fit: contain;
  outline: none;
}
.vp-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-dim);
  font-size: 13px;
  padding: 30px;
  text-align: center;
}
.vp-unsupported {
  font-size: 15px;
  color: var(--text);
}
.vp-reason {
  font-size: 12px;
  color: var(--text-faint);
  max-width: 420px;
  line-height: 1.6;
}
.spinner {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 3px solid var(--vc-ring);
  border-top-color: var(--accent);
  animation: spin 0.9s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.vp-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(8px);
}
.vc-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  color: #fff;
}
.vc-btn:hover {
  background: var(--vc-hover);
}
.vc-time {
  font-size: 12px;
  color: var(--vc-text);
  font-variant-numeric: tabular-nums;
  flex: none;
}
.vc-bar {
  flex: 1;
  height: 5px;
  border-radius: 3px;
  background: var(--vc-track);
  position: relative;
  cursor: pointer;
}
.vc-progress {
  height: 100%;
  border-radius: 3px;
  background: var(--accent);
  pointer-events: none;
}
.vc-thumb {
  position: absolute;
  top: 50%;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  transform: translate(-50%, -50%);
  pointer-events: none;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
}
.vc-vol {
  width: 70px;
}
</style>
