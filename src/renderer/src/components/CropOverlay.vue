?<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import Icon from './Icon.vue'

const props = defineProps<{
  stageWidth: number
  stageHeight: number
  naturalWidth: number
  naturalHeight: number
  scale: number
  offsetX: number
  offsetY: number
}>()

const emit = defineEmits<{ (e: 'done', rect: { x: number; y: number; w: number; h: number } | null): void }>()

/** 图片在舞台上的显示区域(居中 + 缩放平移) */
const imgRect = computed(() => {
  if (!props.naturalWidth || !props.naturalHeight) {
    return { x: 0, y: 0, w: props.stageWidth, h: props.stageHeight }
  }
  const dispW = props.naturalWidth * props.scale
  const dispH = props.naturalHeight * props.scale
  const x = (props.stageWidth - dispW) / 2 + props.offsetX
  const y = (props.stageHeight - dispH) / 2 + props.offsetY
  return { x, y, w: dispW, h: dispH }
})

const sel = reactive({ x: 0, y: 0, w: 0, h: 0 })
const started = ref(false)

type Handle = 'nw' | 'ne' | 'sw' | 'se' | null
let dragMode: 'move' | 'resize' | 'create' | null = null
let activeHandle: Handle = null
let startPt = { x: 0, y: 0 }
let startSel = { x: 0, y: 0, w: 0, h: 0 }

function clampToImg(x: number, y: number): { x: number; y: number } {
  const r = imgRect.value
  return {
    x: Math.max(r.x, Math.min(r.x + r.w, x)),
    y: Math.max(r.y, Math.min(r.y + r.h, y))
  }
}

function down(e: MouseEvent): void {
  const stage = e.currentTarget as HTMLElement
  const rect = stage.getBoundingClientRect()
  const px = e.clientX - rect.left
  const py = e.clientY - rect.top
  startPt = { x: px, y: py }
  startSel = { ...sel }
  const hit = hitHandle(px, py)
  if (hit) {
    dragMode = 'resize'
    activeHandle = hit
  } else if (insideSel(px, py)) {
    dragMode = 'move'
  } else {
    dragMode = 'create'
    sel.x = px
    sel.y = py
    sel.w = 0
    sel.h = 0
    started.value = false
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}

function insideSel(px: number, py: number): boolean {
  return px >= sel.x && px <= sel.x + sel.w && py >= sel.y && py <= sel.y + sel.h
}

function hitHandle(px: number, py: number): Handle {
  const R = 10
  const pts: [Handle, number, number][] = [
    ['nw', sel.x, sel.y],
    ['ne', sel.x + sel.w, sel.y],
    ['sw', sel.x, sel.y + sel.h],
    ['se', sel.x + sel.w, sel.y + sel.h]
  ]
  for (const [h, hx, hy] of pts) {
    if (Math.abs(px - hx) < R && Math.abs(py - hy) < R) return h
  }
  return null
}

function move(e: MouseEvent): void {
  if (!dragMode) return
  const stage = stageRef.value
  if (!stage) return
  const rect = stage.getBoundingClientRect()
  const p = clampToImg(e.clientX - rect.left, e.clientY - rect.top)
  if (dragMode === 'create') {    sel.x = Math.min(startPt.x, p.x)
    sel.y = Math.min(startPt.y, p.y)
    sel.w = Math.abs(p.x - startPt.x)
    sel.h = Math.abs(p.y - startPt.y)
    if (sel.w > 4 && sel.h > 4) started.value = true
  } else if (dragMode === 'move') {
    const dx = p.x - startPt.x
    const dy = p.y - startPt.y
    const r = imgRect.value
    sel.x = Math.max(r.x, Math.min(r.x + r.w - startSel.w, startSel.x + dx))
    sel.y = Math.max(r.y, Math.min(r.y + r.h - startSel.h, startSel.y + dy))
  } else if (dragMode === 'resize' && activeHandle) {
    let x1 = startSel.x
    let y1 = startSel.y
    let x2 = startSel.x + startSel.w
    let y2 = startSel.y + startSel.h
    if (activeHandle.includes('n')) y1 = p.y
    if (activeHandle.includes('s')) y2 = p.y
    if (activeHandle.includes('w')) x1 = p.x
    if (activeHandle.includes('e')) x2 = p.x
    sel.x = Math.min(x1, x2)
    sel.y = Math.min(y1, y2)
    sel.w = Math.abs(x2 - x1)
    sel.h = Math.abs(y2 - y1)
  }
}

function up(): void {
  dragMode = null
  activeHandle = null
  window.removeEventListener('mousemove', move)
  window.removeEventListener('mouseup', up)
}

const stageRef = ref<HTMLElement | null>(null)

/** 选区的像素尺寸(图像坐标) */
const pixelSize = computed(() => ({
  w: Math.round(sel.w / props.scale),
  h: Math.round(sel.h / props.scale)
}))

const canConfirm = computed(() => started.value && sel.w > 2 && sel.h > 2)

function confirm(): void {
  // 舞台坐标 → 图像坐标
  const r = imgRect.value
  const rect = {
    x: (sel.x - r.x) / props.scale,
    y: (sel.y - r.y) / props.scale,
    w: sel.w / props.scale,
    h: sel.h / props.scale
  }
  emit('done', {
    x: Math.max(0, Math.round(rect.x)),
    y: Math.max(0, Math.round(rect.y)),
    w: Math.round(rect.w),
    h: Math.round(rect.h)
  })
}
</script>

<template>
  <div ref="stageRef" class="crop-overlay" @mousedown="down">
    <!-- 四周暗化 -->
    <div class="dim" />
    <div
      class="sel-window"
      :style="{
        left: sel.x + 'px',
        top: sel.y + 'px',
        width: sel.w + 'px',
        height: sel.h + 'px'
      }"
    >
      <span
        v-for="h in ['nw', 'ne', 'sw', 'se'] as const"
        :key="h"
        class="handle"
        :class="h"
      />
    </div>

    <div class="crop-toolbar">
      <span class="crop-size">
        {{ pixelSize.w }} × {{ pixelSize.h }} px
      </span>
      <button class="btn sm" @click="emit('done', null)">
        <Icon name="x" :size="12" /> 取消(Esc)
      </button>
      <button class="btn sm primary" :disabled="!canConfirm" @click="confirm">
        <Icon name="check" :size="12" /> 确认裁切
      </button>
    </div>
    <div v-if="!started" class="crop-hint">在画面上拖拽出裁切区域</div>
  </div>
</template>

<style scoped>
.crop-overlay {
  position: absolute;
  inset: 0;
  z-index: 30;
  cursor: crosshair;
}
.dim {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.52);
}
.sel-window {
  position: absolute;
  border: 1px solid #fff;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.52);
  cursor: move;
}
.handle {
  position: absolute;
  width: 10px;
  height: 10px;
  background: #fff;
  border-radius: 2px;
  border: 1px solid rgba(0, 0, 0, 0.4);
}
.handle.nw {
  left: -5px;
  top: -5px;
  cursor: nwse-resize;
}
.handle.ne {
  right: -5px;
  top: -5px;
  cursor: nesw-resize;
}
.handle.sw {
  left: -5px;
  bottom: -5px;
  cursor: nesw-resize;
}
.handle.se {
  right: -5px;
  bottom: -5px;
  cursor: nwse-resize;
}
.crop-toolbar {
  position: absolute;
  bottom: 90px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(20, 20, 24, 0.85);
  backdrop-filter: blur(10px);
  border-radius: 11px;
  padding: 8px 12px;
  border: 1px solid var(--vc-border);
}
.crop-size {
  font-size: 12.5px;
  color: #fff;
  font-variant-numeric: tabular-nums;
  margin-right: 6px;
}
.crop-hint {
  position: absolute;
  top: 64px;
  left: 50%;
  transform: translateX(-50%);
  color: var(--vc-text-mid);
  font-size: 13px;
  background: rgba(0, 0, 0, 0.45);
  padding: 6px 14px;
  border-radius: 8px;
  pointer-events: none;
}
</style>
