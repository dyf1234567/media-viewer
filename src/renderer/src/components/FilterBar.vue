<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useUiStore } from '../stores/ui'
import { useLibraryStore } from '../stores/library'
import { activeFilterChips, parseRatio } from '../util/pipeline'
import { classifyColor, hsvToRgb, rgbToHsv, rgbToHex, parseHex } from '../../../shared/colors'
import Icon from './Icon.vue'

const ui = useUiStore()
const lib = useLibraryStore()

const FORMATS = ['PNG', 'JPG', 'JPEG', 'WEBP', 'GIF', 'BMP', 'TIFF', 'TIF', 'ICO', 'SVG', 'MP4', 'M4V', 'MOV', 'MKV', 'WEBM', 'AVI']
const SHAPES = [
  { v: 'h', label: '横图' },
  { v: 'v', label: '竖图' },
  { v: 'sq', label: '方形' }
]
/** 取色面板预设色块(与主进程色系分类同源):点击按色系切换筛选 */
const PRESETS = [
  '#FFFFFF', '#C9C9C9', '#8A8A8A', '#4A4A4A', '#151515', '#8B5E3C', '#F2B6C6', '#E0568C',
  '#E03E3E', '#E8862F', '#E3C03A', '#4ECB71', '#3EC6C0', '#5288FF', '#9A6BFF', '#EA5BD8'
].map((hex) => {
  const c = parseHex(hex)!
  return { hex, family: classifyColor(c.r, c.g, c.b) }
})
const RATINGS = [5, 4, 3, 2, 1, 0]
const DATES = [
  { v: 1, label: '今天' },
  { v: 7, label: '7 天内' },
  { v: 30, label: '30 天内' },
  { v: 90, label: '3 个月内' },
  { v: 365, label: '1 年内' }
]
const DIMENSIONS = [
  { v: '4k', label: '4K 及以上' },
  { v: '1080', label: '1080P 及以上' },
  { v: '720', label: '720P 及以上' },
  { v: 'small', label: '小图 (<720P)' }
]
const SIZES = [
  { v: '>10mb', label: '>10MB' },
  { v: '>1mb', label: '>1MB' },
  { v: '>100kb', label: '>100KB' },
  { v: '<100kb', label: '<100KB' },
  { v: '<1mb', label: '<1MB' }
]
const NOTES = [
  { v: 'yes', label: '有注释' },
  { v: 'no', label: '无注释' }
]

/** 各维度图标(颜色维度用彩虹圆环,单独渲染) */
const DIM_ICONS: Record<string, string> = {
  formats: 'layers',
  shape: 'crop',
  tags: 'tag',
  albums: 'folder',
  rating: 'star',
  dateAdded: 'clock',
  dateModified: 'clock',
  note: 'edit',
  dimension: 'scan',
  size: 'hash'
}

/** 下拉定义:菜单项渲染 + 选中态判断 */
interface MenuDim {
  key: string
  label: string
  multi: boolean
  items: { v: string | number; label: string; dot?: string }[]
  selected: (v: string | number) => boolean
  toggle: (v: string | number) => void
}

const dims = computed<MenuDim[]>(() => {
  const f = ui.filters
  const single = (
    key: string,
    label: string,
    items: { v: string | number; label: string }[],
    get: () => string | number,
    set: (v: string | number) => void
  ): MenuDim => ({
    key,
    label,
    multi: false,
    items,
    selected: (v) => get() === v,
    toggle: (v) => set(get() === v ? (key === 'rating' ? -1 : key.startsWith('date') ? 0 : '') : v)
  })
  return [
    {
      key: 'formats',
      label: '格式',
      multi: true,
      items: FORMATS.map((x) => ({ v: x.toLowerCase(), label: x })),
      selected: (v) => f.formats.includes(String(v)),
      toggle: (v) => {
        const s = String(v)
        f.formats = f.formats.includes(s) ? f.formats.filter((x) => x !== s) : [...f.formats, s]
      }
    },
    single('shape', '形状', SHAPES, () => f.shape, (v) => {
      f.shapeCustom = ''
      f.shape = v as '' | 'h' | 'v' | 'sq'
    }),
    {
      key: 'tags',
      label: '标签',
      multi: true,
      items: lib.tags.map((t) => ({ v: t.id, label: `${t.name} (${t.usage})` })),
      selected: (v) => f.tags.includes(Number(v)),
      toggle: (v) => {
        const n = Number(v)
        f.tags = f.tags.includes(n) ? f.tags.filter((x) => x !== n) : [...f.tags, n]
      }
    },
    {
      key: 'albums',
      label: '文件夹',
      multi: true,
      items: lib.albums.map((a) => ({ v: a.id, label: a.name })),
      selected: (v) => f.albums.includes(Number(v)),
      toggle: (v) => {
        const n = Number(v)
        f.albums = f.albums.includes(n) ? f.albums.filter((x) => x !== n) : [...f.albums, n]
      }
    },
    {
      key: 'colors',
      label: '颜色',
      multi: true,
      items: [],
      selected: (v) => ui.filters.colors.includes(String(v)),
      toggle: (v) => {
        const s = String(v)
        ui.filters.colors = ui.filters.colors.includes(s) ? ui.filters.colors.filter((x) => x !== s) : [...ui.filters.colors, s]
      }
    },
    {
      key: 'rating',
      label: '评分',
      multi: false,
      items: RATINGS.map((v) => ({ v, label: v === 0 ? '尚未评分' : `${v} 星及以上` })),
      selected: (v) => f.rating === Number(v),
      toggle: (v) => (f.rating = f.rating === Number(v) ? -1 : (Number(v) as typeof f.rating))
    },
    single('dateAdded', '添加日期', DATES, () => f.dateAdded, (v) => (f.dateAdded = Number(v))),
    single('dateModified', '修改日期', DATES, () => f.dateModified, (v) => (f.dateModified = Number(v))),
    single('note', '注释', NOTES, () => f.note, (v) => (f.note = v as '' | 'yes' | 'no')),
    single('dimension', '尺寸', DIMENSIONS, () => f.dimension, (v) => (f.dimension = v as '')),
    single('size', '大小', SIZES, () => f.size, (v) => (f.size = v as ''))
  ]
})

const openKey = ref<string | null>(null)
const popX = ref(0)
const popY = ref(0)

/** 常驻筛选维度,其余收进「更多」 */
const COMMON = ['formats', 'shape', 'rating', 'colors']

const moreOpen = ref(false)
const moreX = ref(0)
const moreY = ref(0)

function toggleMore(e: MouseEvent): void {
  if (moreOpen.value) {
    moreOpen.value = false
    return
  }
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  moreX.value = r.left
  moreY.value = r.bottom + 6
  moreOpen.value = true
}

/** 从「更多」列表展开某维度:锚回更多按钮的位置,视觉不跳动 */
function openMoreDim(key: string): void {
  moreOpen.value = false
  popX.value = moreX.value
  popY.value = moreY.value
  openKey.value = key
}

function openDim(key: string, e: MouseEvent): void {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  popX.value = r.left
  popY.value = r.bottom + 6
  openKey.value = key
}

const openDimDef = computed(() => dims.value.find((d) => d.key === openKey.value))

const chips = computed(() =>
  activeFilterChips(
    ui.filters,
    (id) => lib.tags.find((t) => t.id === id)?.name ?? `#${id}`,
    (id) => lib.albums.find((a) => a.id === id)?.name ?? `#${id}`
  )
)

function hasActive(key: string): boolean {
  if (key === 'rating') return ui.filters.rating >= 0
  if (key === 'dateAdded') return !!ui.filters.dateAdded
  if (key === 'dateModified') return !!ui.filters.dateModified
  if (key === 'shape') return !!ui.filters.shape || !!ui.filters.shapeCustom
  const v = (ui.filters as unknown as Record<string, unknown>)[key]
  if (Array.isArray(v)) return v.length > 0
  return !!v
}

/** 清空单个维度的筛选 */
function clearDim(key: string): void {
  const f = ui.filters
  if (key === 'formats') f.formats = []
  else if (key === 'colors') f.colors = []
  else if (key === 'tags') f.tags = []
  else if (key === 'albums') f.albums = []
  else if (key === 'shape') {
    f.shape = ''
    f.shapeCustom = ''
  } else if (key === 'rating') f.rating = -1
  else if (key === 'dateAdded') f.dateAdded = 0
  else if (key === 'dateModified') f.dateModified = 0
  else if (key === 'note') f.note = ''
  else if (key === 'dimension') f.dimension = ''
  else if (key === 'size') f.size = ''
}

/* ===== Eagle 式取色面板 ===== */
const pick = reactive({ h: 0, s: 1, v: 1 })
const hexInput = ref('#FF0000')

const pickedRgb = computed(() => hsvToRgb(pick.h, pick.s, pick.v))
const pickedHex = computed(() => rgbToHex(pickedRgb.value.r, pickedRgb.value.g, pickedRgb.value.b))
const svStyle = computed(() => ({
  background: `linear-gradient(to top, #000, rgba(0, 0, 0, 0)), linear-gradient(to right, #fff, hsl(${pick.h}, 100%, 50%))`
}))

function syncHexInput(): void {
  hexInput.value = pickedHex.value
}
function applyPicked(): void {
  const family = classifyColor(pickedRgb.value.r, pickedRgb.value.g, pickedRgb.value.b)
  if (family && !ui.filters.colors.includes(family)) ui.filters.colors = [...ui.filters.colors, family]
}
function svSet(e: PointerEvent): void {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  pick.s = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
  pick.v = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
  syncHexInput()
}
function svDown(e: PointerEvent): void {
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  svSet(e)
}
function svMove(e: PointerEvent): void {
  if (e.buttons & 1) svSet(e)
}
function svUp(): void {
  applyPicked()
}
function hueSet(e: PointerEvent): void {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  pick.h = Math.min(359.9, Math.max(0, ((e.clientY - r.top) / r.height) * 360))
  syncHexInput()
}
function hueDown(e: PointerEvent): void {
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  hueSet(e)
}
function hueMove(e: PointerEvent): void {
  if (e.buttons & 1) hueSet(e)
}
function applyHex(): void {
  const c = parseHex(hexInput.value)
  if (!c) return
  const hsv = rgbToHsv(c.r, c.g, c.b)
  pick.h = hsv.h
  pick.s = hsv.s
  pick.v = hsv.v
  applyPicked()
}
function presetClick(family: string | null): void {
  if (!family) return
  ui.filters.colors = ui.filters.colors.includes(family)
    ? ui.filters.colors.filter((x) => x !== family)
    : [...ui.filters.colors, family]
}

/* ===== 形状自定义比例 ===== */
const shapeCustomInput = ref('')
function applyShapeCustom(): void {
  if (parseRatio(shapeCustomInput.value) == null) return
  ui.filters.shapeCustom = shapeCustomInput.value.trim()
  ui.filters.shape = ''
  openKey.value = null
}
</script>

<template>
  <!-- Eagle 式筛选行:图标+文字的透明标签,点开弹层;颜色为色板网格,评分为星形 -->
  <div v-if="ui.page === 'library'" class="filterbar">
    <div class="dim-row">
      <template v-for="d in dims" :key="d.key">
        <button
          v-if="COMMON.includes(d.key)"
          class="dim-btn"
          :class="{ active: hasActive(d.key), open: openKey === d.key }"
          @click="openDim(d.key, $event)"
        >
          <span v-if="d.key === 'colors'" class="hue-ring" />
          <Icon v-else :name="DIM_ICONS[d.key]" :size="13" />
          <span class="dim-label">{{ d.label }}</span>
          <span v-if="hasActive(d.key)" class="active-dot" />
        </button>
      </template>
      <button
        class="dim-btn"
        :class="{ open: moreOpen }"
        title="其余筛选条件"
        @click="toggleMore($event)"
      >
        <Icon name="plus" :size="12" />
        <span class="dim-label">更多</span>
      </button>
    </div>
    <div v-if="chips.length" class="chip-row">
      <span
        v-for="c in chips"
        :key="c.key"
        class="chip"
        :title="`${c.label} — 点击移除`"
        @click="c.clear()"
      >
        {{ c.label }}
        <Icon name="x" :size="11" />
      </span>
      <button class="chip clear-all" @click="ui.clearFilters()">清空全部</button>
    </div>

    <Teleport to="body">
      <div v-if="openKey || moreOpen" class="popover-backdrop" @mousedown="openKey = null; moreOpen = false" @contextmenu.prevent />
      <div v-if="moreOpen" class="popover" :style="{ left: moreX + 'px', top: moreY + 'px' }">
        <div class="popover-label">更多筛选</div>
        <div
          v-for="d in dims.filter((x) => !COMMON.includes(x.key))"
          :key="d.key"
          class="popover-item"
          :class="{ active: hasActive(d.key) }"
          @click="openMoreDim(d.key)"
        >
          <Icon :name="DIM_ICONS[d.key]" :size="13" style="opacity: 0.7" />
          {{ d.label }}
          <Icon v-if="hasActive(d.key)" name="check" :size="13" style="margin-left: auto" />
          <Icon v-else name="chevron-right" :size="13" style="margin-left: auto; opacity: 0.5" />
        </div>
      </div>
      <div v-if="openKey && openDimDef" class="popover" :style="{ left: popX + 'px', top: popY + 'px' }">
        <div class="popover-label">{{ openDimDef.label }}</div>
        <!-- 颜色:Eagle 式取色面板(SV 渐变方 + 色相条 + 预设色块 + hex 输入) -->
        <div v-if="openKey === 'colors'" class="color-picker">
          <div class="picker-main">
            <div
              class="sv-square"
              :style="svStyle"
              @pointerdown.prevent="svDown"
              @pointermove="svMove"
              @pointerup="svUp"
            >
              <span
                class="sv-cursor"
                :style="{ left: pick.s * 100 + '%', top: (1 - pick.v) * 100 + '%' }"
              />
            </div>
            <div
              class="hue-strip"
              @pointerdown.prevent="hueDown"
              @pointermove="hueMove"
              @pointerup="svUp"
            >
              <span class="hue-cursor" :style="{ top: (pick.h / 360) * 100 + '%' }" />
            </div>
          </div>
          <div class="preset-grid">
            <button
              v-for="p in PRESETS"
              :key="p.hex"
              class="preset"
              :class="{ sel: p.family ? ui.filters.colors.includes(p.family) : false }"
              :title="p.hex"
              @click="presetClick(p.family)"
            >
              <span class="preset-dot" :style="{ background: p.hex }" />
            </button>
          </div>
          <div class="hex-row">
            <span class="hex-prev" :style="{ background: pickedHex }" />
            <input
              v-model="hexInput"
              class="hex-input"
              type="text"
              spellcheck="false"
              placeholder="#FF0000"
              @keydown.enter="applyHex"
            />
            <button class="hex-apply" title="按此颜色筛选" @click="applyHex">
              <Icon name="check" :size="13" />
            </button>
          </div>
        </div>
        <!-- 评分:星形行 -->
        <template v-else-if="openKey === 'rating'">
          <div
            v-for="item in openDimDef.items"
            :key="String(item.v)"
            class="popover-item rate-item"
            :class="{ active: openDimDef.selected(item.v) }"
            @click="openDimDef.toggle(item.v)"
          >
            <span class="stars">
              <Icon v-for="s in 5" :key="s" name="star" :size="13" :filled="s <= item.v" :class="{ on: s <= item.v }" />
            </span>
            <span class="rate-name">{{ item.label }}</span>
            <Icon v-if="openDimDef.selected(item.v)" name="check" :size="13" style="margin-left: auto" />
          </div>
        </template>
        <!-- 其余:常规列表 -->
        <template v-else>
          <template v-if="openDimDef.items.length">
            <div
              v-for="item in openDimDef.items"
              :key="String(item.v)"
              class="popover-item"
              :class="{ active: openDimDef.selected(item.v) }"
              @click="openDimDef.toggle(item.v)"
            >
              <span v-if="item.dot" class="color-dot" :style="{ background: item.dot }" />
              {{ item.label }}
              <Icon v-if="openDimDef.selected(item.v)" name="check" :size="13" style="margin-left: auto" />
            </div>
          </template>
          <div v-else class="popover-label">暂无可选项</div>
          <!-- 形状:自定义比例 -->
          <div v-if="openKey === 'shape'" class="custom-ratio">
            <input
              v-model="shapeCustomInput"
              class="cr-input"
              type="text"
              spellcheck="false"
              placeholder="自定义比例,如 16:9"
              @keydown.enter="applyShapeCustom"
            />
            <button class="cr-apply" :disabled="parseRatio(shapeCustomInput) == null" title="应用自定义比例" @click="applyShapeCustom">
              <Icon name="check" :size="13" />
            </button>
          </div>
        </template>
        <div v-if="hasActive(openKey)" class="pop-footer" @click="clearDim(openKey); openKey = null">
          <Icon name="x" :size="12" />
          清空本项
        </div>
        <div v-else-if="openDimDef.multi" class="pop-hint">可多选,全部同时生效</div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.filterbar {
  padding: 2px 14px 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: none;
  color: var(--text-faint);
}
.dim-row {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-wrap: wrap;
  row-gap: 4px;
}
/* Eagle 式:图标+文字的透明标签,无底色边框 */
.dim-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 9px;
  border-radius: 7px;
  background: transparent;
  border: none;
  color: var(--text-dim);
  font-size: 12px;
  position: relative;
}
.dim-btn:hover {
  background: var(--bg-glass);
  color: var(--text);
}
.dim-btn.open {
  background: var(--bg-glass-strong);
  color: var(--text);
}
.dim-btn.active {
  color: var(--accent);
}
.active-dot {
  position: absolute;
  left: 50%;
  bottom: 1px;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--accent);
  transform: translateX(-50%);
}
/* 彩虹圆环(颜色维度图标) */
.hue-ring {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  flex: none;
  background: conic-gradient(#e05656, #e8b23a, #4ecb71, #3ec6c0, #5288ff, #9a6bff, #ef7fb2, #e05656);
  -webkit-mask: radial-gradient(circle, transparent 3.5px, #000 4px);
  mask: radial-gradient(circle, transparent 3.5px, #000 4px);
}
.chip-row {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 6px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 11px;
  cursor: pointer;
  max-width: 280px;
  white-space: nowrap;
  overflow: hidden;
}
.chip:hover {
  background: rgba(255, 93, 93, 0.18);
  color: var(--danger);
}
.chip.clear-all {
  background: none;
  border: 1px dashed var(--border-strong);
  color: var(--text-faint);
}
.chip.clear-all:hover {
  color: var(--text);
}
.color-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex: none;
}
.popover-backdrop {
  position: fixed;
  inset: 0;
  z-index: 299;
}
/* 本组件弹层:比全局更深一档、更大圆角 */
.popover {
  background: #23242d;
  border-radius: 10px;
  padding: 7px;
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.5);
}
/* ===== Eagle 式取色面板 ===== */
.color-picker {
  width: 236px;
  padding: 2px;
}
.picker-main {
  display: flex;
  gap: 8px;
  height: 150px;
}
.sv-square {
  position: relative;
  flex: 1;
  border-radius: 8px;
  cursor: crosshair;
  touch-action: none;
}
.sv-cursor {
  position: absolute;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6);
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.hue-strip {
  position: relative;
  width: 14px;
  border-radius: 7px;
  cursor: ns-resize;
  touch-action: none;
  background: linear-gradient(
    to bottom,
    #f00 0%,
    #ff0 16.7%,
    #0f0 33.3%,
    #0ff 50%,
    #00f 66.7%,
    #f0f 83.3%,
    #f00 100%
  );
}
.hue-cursor {
  position: absolute;
  left: -2px;
  right: -2px;
  height: 4px;
  border-radius: 2px;
  border: 1px solid #fff;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6);
  transform: translateY(-50%);
  pointer-events: none;
}
.preset-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 6px;
  margin-top: 10px;
}
.preset {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  background: transparent;
  border: none;
  cursor: pointer;
}
.preset-dot {
  width: 21px;
  height: 21px;
  border-radius: 6px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16);
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
.preset:hover .preset-dot {
  transform: scale(1.12);
}
.preset.sel .preset-dot {
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.2),
    0 0 0 2px #23242d,
    0 0 0 4px var(--accent);
}
.hex-row {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 10px;
  padding: 5px 6px;
  border-radius: 8px;
  border: 1px solid var(--border-strong);
  background: rgba(0, 0, 0, 0.22);
}
.hex-prev {
  width: 16px;
  height: 16px;
  border-radius: 5px;
  flex: none;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.25);
}
.hex-input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text);
  font-size: 12px;
  font-family: Consolas, monospace;
}
.hex-apply,
.cr-apply {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex: none;
  border-radius: 6px;
  background: transparent;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
}
.hex-apply:hover,
.cr-apply:hover {
  background: var(--bg-glass-strong);
  color: var(--text);
}
/* 形状自定义比例 */
.custom-ratio {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  padding: 5px 6px;
  border-radius: 8px;
  border: 1px solid var(--border-strong);
  background: rgba(0, 0, 0, 0.22);
}
.cr-input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text);
  font-size: 12px;
}
.cr-apply:disabled {
  opacity: 0.35;
  cursor: default;
}
/* 评分星形行 */
.rate-item .stars {
  display: inline-flex;
  gap: 1px;
  width: 76px;
  color: var(--text-faint);
}
.stars svg.on {
  color: #f2c94c;
}
.rate-name {
  color: var(--text-dim);
  font-size: 12px;
}
.rate-item.active .rate-name {
  color: var(--accent);
}
/* 弹层底部动作 */
.pop-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin-top: 5px;
  padding: 5px 8px;
  border-top: 1px solid var(--border);
  border-radius: 0 0 8px 8px;
  font-size: 11px;
  color: var(--text-faint);
  cursor: pointer;
}
.pop-footer:hover {
  color: var(--danger);
}
.pop-hint {
  padding: 5px 10px 3px;
  font-size: 11px;
  color: var(--text-faint);
  border-top: 1px solid var(--border);
  margin-top: 5px;
}
</style>
