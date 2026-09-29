<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { HistogramData } from '@sh/types'
import Icon from '../Icon.vue'

const props = defineProps<{ assetId: number }>()

type Channel = 'r' | 'g' | 'b' | 'l'
const CHANNEL_LABEL: Record<Channel, string> = { r: 'R', g: 'G', b: 'B', l: '亮度' }
// "颜色" 通道 = RGB 叠加显示
type ViewMode = Channel | 'color'
const MODE_LABEL: Record<ViewMode, string> = { color: '颜色', r: 'R', g: 'G', b: 'B', l: '亮度' }

const data = ref<HistogramData | null>(null)
const loading = ref(false)
const mode = ref<ViewMode>('color')
const canvasEl = ref<HTMLCanvasElement | null>(null)

async function load(force = false): Promise<void> {
  loading.value = true
  try {
    data.value = await window.mv.meta.histogram(props.assetId, force)
  } finally {
    loading.value = false
  }
}

onMounted(() => load())
watch(
  () => props.assetId,
  () => {
    mode.value = 'color'
    void load()
  }
)

const stat = computed(() => {
  if (!data.value) return null
  if (mode.value === 'color') return data.value.stats.l
  return data.value.stats[mode.value]
})

// 数据就绪后 canvas 才随 v-else 渲染,必须等 DOM 更新完再画,否则拿不到元素画不出来
watch([data, mode], async () => {
  await nextTick()
  draw()
})

// 画布出现/尺寸变化(详情面板宽度调整)时重绘,避免拉伸模糊
let ro: ResizeObserver | null = null
watch(canvasEl, (cv) => {
  if (!cv) return
  ro?.disconnect()
  ro = new ResizeObserver(() => draw())
  ro.observe(cv)
})
onBeforeUnmount(() => ro?.disconnect())

function draw(): void {
  const cv = canvasEl.value
  const d = data.value
  if (!cv || !d) return
  const ctx = cv.getContext('2d')
  if (!ctx) return
  const w = (cv.width = cv.clientWidth * 2)
  const h = (cv.height = 280)
  ctx.scale(1, 1)
  ctx.clearRect(0, 0, w, h)

  // 网格
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.lineWidth = 1
  for (let i = 1; i < 4; i++) {
    const y = (h / 4) * i
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
  }
  for (let i = 1; i < 4; i++) {
    const x = (w / 4) * i
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, h)
    ctx.stroke()
  }

  const drawChannel = (ch: Channel, color: string, alpha = 0.75): void => {
    const hist = d.channels[ch]
    const max = Math.max(...hist, 1)
    ctx.beginPath()
    ctx.moveTo(0, h)
    for (let v = 0; v < 256; v++) {
      const x = (v / 255) * w
      const y = h - (hist[v] / max) * (h - 10)
      ctx.lineTo(x, y)
    }
    ctx.lineTo(w, h)
    ctx.closePath()
    ctx.globalAlpha = alpha
    ctx.fillStyle = color
    ctx.fill()
    ctx.globalAlpha = 1
  }

  if (mode.value === 'color') {
    ctx.globalCompositeOperation = 'lighter'
    drawChannel('r', 'rgba(255,60,60,0.55)')
    drawChannel('g', 'rgba(60,255,90,0.55)')
    drawChannel('b', 'rgba(70,110,255,0.55)')
    ctx.globalCompositeOperation = 'source-over'
  } else {
    drawChannel(mode.value, mode.value === 'l' ? 'rgba(200,203,214,0.7)' : 'rgba(120,150,255,0.65)')
  }
}

const percentileKeys = computed(() => {
  const s = stat.value
  if (!s) return []
  return Object.keys(s.percentiles).map((k) => ({ k, v: s.percentiles[k] }))
})
</script>

<template>
  <div class="hist-box">
    <div class="hist-head">
      <span class="sec-title">直方图</span>
      <div class="mode-tabs">
        <button
          v-for="(label, m) in MODE_LABEL"
          :key="m"
          class="mode-tab"
          :class="{ active: mode === m }"
          @click="mode = m as ViewMode"
        >
          {{ label }}
        </button>
      </div>
      <button class="mini-btn" title="手动刷新" :disabled="loading" @click="load(true)">
        <Icon name="refresh" :size="13" />
      </button>
    </div>

    <div v-if="loading" class="hist-loading skeleton" />
    <div v-else-if="!data" class="hist-empty">无法计算直方图(可能是 SVG / ICO 等格式)</div>
    <template v-else>
      <canvas ref="canvasEl" class="hist-canvas" />
      <div v-if="stat" class="stat-grid">
        <div class="stat"><span>平均值</span><b>{{ stat.mean }}</b></div>
        <div class="stat"><span>中位数</span><b>{{ stat.median }}</b></div>
        <div class="stat"><span>众数</span><b>{{ stat.mode }} ({{ stat.modeCount }})</b></div>
        <div class="stat"><span>标准差</span><b>{{ stat.std }}</b></div>
        <div class="stat"><span>像素数</span><b>{{ stat.count.toLocaleString() }}</b></div>
        <div class="stat"><span>级别</span><b>{{ stat.levels }}</b></div>
      </div>
      <div v-if="percentileKeys.length" class="pct-row">
        <span v-for="p in percentileKeys" :key="p.k" class="pct">
          <i>{{ p.k }}%</i> {{ p.v }}
        </span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.hist-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.sec-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-dim);
  flex: 1;
}
.mode-tabs {
  display: flex;
  background: var(--bg-glass);
  border-radius: 6px;
  padding: 2px;
}
.mode-tab {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 5px;
  color: var(--text-faint);
}
.mode-tab.active {
  background: var(--accent-soft);
  color: #a9c0ff;
}
.mini-btn {
  display: flex;
  padding: 4px;
  border-radius: 6px;
  color: var(--text-dim);
}
.mini-btn:hover {
  background: var(--bg-glass-strong);
}
.hist-canvas {
  width: 100%;
  height: 110px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.28);
}
.hist-loading {
  height: 110px;
  border-radius: 8px;
}
.hist-empty {
  font-size: 11.5px;
  color: var(--text-faint);
  padding: 18px 0;
  text-align: center;
}
.stat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 6px;
  margin-top: 10px;
}
.stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 10px;
  color: var(--text-faint);
  background: var(--bg-glass);
  border-radius: 7px;
  padding: 6px 8px;
}
.stat b {
  font-size: 11.5px;
  color: var(--text);
  font-weight: 500;
  word-break: break-all;
}
.pct-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin-top: 8px;
}
.pct {
  font-size: 10.5px;
  color: var(--text-dim);
}
.pct i {
  font-style: normal;
  color: var(--text-faint);
  margin-right: 3px;
}
</style>
