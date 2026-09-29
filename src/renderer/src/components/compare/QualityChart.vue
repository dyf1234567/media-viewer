<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { QualityReport } from '@sh/types'

const props = defineProps<{
  report: QualityReport
  metric: 'psnr' | 'ssim'
  currentFrame: number
}>()
const emit = defineEmits<{ (e: 'seek', frame: number): void }>()

const canvasEl = ref<HTMLCanvasElement | null>(null)
let ro: ResizeObserver | null = null

function draw(): void {
  const cv = canvasEl.value
  if (!cv) return
  const dpr = window.devicePixelRatio || 1
  const w = cv.clientWidth
  const h = cv.clientHeight
  if (!w || !h) return
  cv.width = w * dpr
  cv.height = h * dpr
  const ctx = cv.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  const padL = 44
  const padR = 10
  const padT = 8
  const padB = 18
  const cw = w - padL - padR
  const ch = h - padT - padB

  const vals = props.report.frames
    .map((f) => (props.metric === 'psnr' ? f.psnr : f.ssim))
    .filter((v) => !isNaN(v)) as number[]
  if (!vals.length) return
  let min = Math.min(...vals)
  let max = Math.max(...vals)
  if (props.metric === 'ssim') {
    min = Math.max(0, min - 0.01)
    max = Math.min(1, max + 0.01)
  } else {
    const span = Math.max(1, max - min)
    min = Math.max(0, min - span * 0.1)
    max = max + span * 0.1
  }
  const total = props.report.frames.length

  // 网格与 Y 轴标签
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.font = '10px system-ui'
  ctx.lineWidth = 1
  for (let i = 0; i <= 3; i++) {
    const y = padT + (ch / 3) * i
    ctx.beginPath()
    ctx.moveTo(padL, y)
    ctx.lineTo(w - padR, y)
    ctx.stroke()
    const v = max - ((max - min) / 3) * i
    ctx.fillText(v.toFixed(props.metric === 'psnr' ? 1 : 3), 4, y + 3)
  }

  // 曲线
  const xOf = (n: number): number => padL + ((n - 1) / Math.max(1, total - 1)) * cw
  const yOf = (v: number): number => padT + ch - ((v - min) / (max - min || 1)) * ch
  ctx.beginPath()
  let started = false
  for (const f of props.report.frames) {
    const v = props.metric === 'psnr' ? f.psnr : f.ssim
    if (isNaN(v)) continue
    const x = xOf(f.n)
    const y = yOf(v)
    if (!started) {
      ctx.moveTo(x, y)
      started = true
    } else {
      ctx.lineTo(x, y)
    }
  }
  ctx.strokeStyle = props.metric === 'psnr' ? '#4f7cff' : '#4dd882'
  ctx.lineWidth = 1.6
  ctx.stroke()

  // 最差帧标记
  const worstV = props.metric === 'psnr' ? props.report.worstPsnr : props.report.worstSsim
  const wx = xOf(props.report.worstFrame)
  const wy = yOf(worstV)
  ctx.fillStyle = '#ff5d5d'
  ctx.beginPath()
  ctx.arc(wx, wy, 3.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,93,93,0.9)'
  ctx.font = '10px system-ui'
  ctx.fillText(`最差 #${props.report.worstFrame}`, Math.min(wx + 6, w - 70), Math.min(wy + 12, h - 6))

  // 当前帧指示线
  if (props.currentFrame >= 1 && props.currentFrame <= total) {
    const cx = xOf(props.currentFrame)
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.moveTo(cx, padT)
    ctx.lineTo(cx, padT + ch)
    ctx.stroke()
    ctx.setLineDash([])
  }

  // 悬停十字线 + 数值气泡
  if (hoverFrame.value >= 1 && hoverFrame.value <= total) {
    const f = props.report.frames[hoverFrame.value - 1]
    const v = f ? (props.metric === 'psnr' ? f.psnr : f.ssim) : NaN
    const hx = xOf(hoverFrame.value)
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(hx, padT)
    ctx.lineTo(hx, padT + ch)
    ctx.stroke()
    if (!isNaN(v)) {
      ctx.fillStyle = props.metric === 'psnr' ? '#4f7cff' : '#4dd882'
      ctx.beginPath()
      ctx.arc(hx, yOf(v), 3, 0, Math.PI * 2)
      ctx.fill()
    }
    const t = ((hoverFrame.value - 1) / Math.max(1, props.report.fps)).toFixed(2)
    const label = `#${hoverFrame.value}  ${t}s  ${isNaN(v) ? '—' : v.toFixed(props.metric === 'psnr' ? 2 : 4)}`
    ctx.font = '10.5px system-ui'
    const tw = ctx.measureText(label).width + 12
    const bx = Math.min(Math.max(hx - tw / 2, padL), w - padR - tw)
    const by = padT
    ctx.fillStyle = 'rgba(10,12,18,0.88)'
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'
    ctx.beginPath()
    ctx.roundRect(bx, by, tw, 18, 4)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#e9e9ee'
    ctx.fillText(label, bx + 6, by + 12.5)
  }

  // X 轴帧号
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.fillText('0', padL, h - 4)
  const xLabel = `第 ${total} 帧`
  ctx.fillText(xLabel, w - padR - ctx.measureText(xLabel).width, h - 4)

  clickArea.x0 = padL
  clickArea.x1 = w - padR
  clickArea.total = total
}

const clickArea = { x0: 0, x1: 0, total: 1 }
const hoverFrame = ref(-1)

function frameAtX(x: number): number {
  const pct = (x - clickArea.x0) / Math.max(1, clickArea.x1 - clickArea.x0)
  return Math.max(1, Math.min(clickArea.total, Math.round(pct * (clickArea.total - 1)) + 1))
}

function onClick(e: MouseEvent): void {
  const cv = canvasEl.value!
  const rect = cv.getBoundingClientRect()
  emit('seek', frameAtX(e.clientX - rect.left))
}

function onMouseMove(e: MouseEvent): void {
  const cv = canvasEl.value
  if (!cv) return
  const rect = cv.getBoundingClientRect()
  const f = frameAtX(e.clientX - rect.left)
  if (f !== hoverFrame.value) {
    hoverFrame.value = f
    draw()
  }
}

function onMouseLeave(): void {
  if (hoverFrame.value !== -1) {
    hoverFrame.value = -1
    draw()
  }
}

onMounted(() => {
  ro = new ResizeObserver(() => draw())
  if (canvasEl.value) ro.observe(canvasEl.value)
  draw()
})
onBeforeUnmount(() => ro?.disconnect())
watch(
  () => [props.metric, props.report, props.currentFrame],
  () => draw(),
  { deep: false }
)
</script>

<template>
  <canvas
    ref="canvasEl"
    class="qchart"
    title="悬停查看数值,点击任意位置两侧同步跳转到该帧"
    @click="onClick"
    @mousemove="onMouseMove"
    @mouseleave="onMouseLeave"
  />
</template>

<style scoped>
.qchart {
  width: 100%;
  height: 100%;
  display: block;
  cursor: crosshair;
}
</style>
