?<script setup lang="ts">
import { computed, ref } from 'vue'
import { useUiStore } from '../stores/ui'
import { useLibraryStore } from '../stores/library'
import { activeFilterChips } from '../util/pipeline'
import Icon from './Icon.vue'

const ui = useUiStore()
const lib = useLibraryStore()

const FORMATS = ['PNG', 'JPG', 'JPEG', 'WEBP', 'GIF', 'BMP', 'TIFF', 'TIF', 'ICO', 'SVG', 'MP4', 'M4V', 'MOV', 'MKV', 'WEBM', 'AVI']
const SHAPES = [
  { v: 'h', label: '横图' },
  { v: 'v', label: '竖图' },
  { v: 'sq', label: '方形' }
]
const COLORS = [
  { v: 'red', label: '红色系', dot: '#e05656' },
  { v: 'green', label: '绿色系', dot: '#4ecb71' },
  { v: 'blue', label: '蓝色系', dot: '#5288ff' },
  { v: 'warm', label: '暖色调', dot: '#f0a35e' },
  { v: 'cool', label: '冷色调', dot: '#6fc3d8' }
]
const RATINGS = [
  { v: 5, label: '★★★★★' },
  { v: 4, label: '★★★★' },
  { v: 3, label: '★★★' },
  { v: 2, label: '★★' },
  { v: 1, label: '★' },
  { v: 0, label: '尚未评分' }
]
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
    single('shape', '形状', SHAPES, () => f.shape, (v) => (f.shape = v as '' | 'h' | 'v' | 'sq')),
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
      items: COLORS,
      selected: (v) => f.colors.includes(String(v)),
      toggle: (v) => {
        const s = String(v)
        f.colors = f.colors.includes(s) ? f.colors.filter((x) => x !== s) : [...f.colors, s]
      }
    },
    single('rating', '评分', RATINGS, () => f.rating, (v) => (f.rating = Number(v) as typeof f.rating)),
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
  const v = (ui.filters as unknown as Record<string, unknown>)[key]
  if (Array.isArray(v)) return v.length > 0
  return !!v
}
</script>

<template>
  <div v-if="ui.page === 'library'" class="filterbar">
    <div class="dim-row">
      <Icon name="filter" :size="13" />
      <button
        v-for="d in dims"
        :key="d.key"
        class="dim-btn"
        :class="{ active: hasActive(d.key), open: openKey === d.key }"
        @click="openDim(d.key, $event)"
      >
        {{ d.label }}
        <Icon name="chevron-down" :size="11" />
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
      <div v-if="openKey" class="popover-backdrop" @mousedown="openKey = null" @contextmenu.prevent />
      <div v-if="openKey && openDimDef" class="popover" :style="{ left: popX + 'px', top: popY + 'px' }">
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
        <div v-if="openDimDef.multi" class="popover-label">可多选,全部同时生效</div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.filterbar {
  padding: 2px 14px 8px;
  display: flex;
  flex-direction: column;
  gap: 7px;
  flex: none;
  color: var(--text-faint);
}
.dim-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.dim-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border-radius: 999px;
  background: var(--bg-glass);
  border: 1px solid transparent;
  color: var(--text-dim);
  font-size: 12px;
}
.dim-btn:hover {
  background: var(--bg-glass-strong);
  color: var(--text);
}
.dim-btn.active {
  background: var(--accent-soft);
  color: var(--accent);
  border-color: rgba(79, 124, 255, 0.35);
}
.chip-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 9px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 12px;
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
</style>
