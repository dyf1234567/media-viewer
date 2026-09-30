?<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import type { Asset } from '@sh/types'
import { useUiStore } from '../stores/ui'
import { useLibraryStore } from '../stores/library'
import { useToastStore } from '../stores/toast'
import { useTrayStore } from '../stores/tray'
import { scopeFilter, applyFilters, applySort } from '../util/pipeline'
import { thumbUrl, fmtBytes, rgbCss } from '../util/format'
import { importFlow } from '../composables/importFlow'
import Icon from './Icon.vue'
import RatingStars from './details/RatingStars.vue'

const ui = useUiStore()
const lib = useLibraryStore()
const toast = useToastStore()
const tray = useTrayStore()

// ---------- 数据管道 ----------
const items = computed<Asset[]>(() => {
  const scoped = scopeFilter(lib.assets, ui.scope, ui.scopeAlbumId, ui.randomIds)
  const filtered = applyFilters(scoped, ui.filters, ui.search)
  return applySort(filtered, ui.sortKey, ui.isRandom)
})
const orderedIds = computed(() => items.value.map((a) => a.id))

// ---------- 滚动与布局 ----------
const containerEl = ref<HTMLElement | null>(null)
const scrollState = reactive({ top: 0, height: 0, width: 0 })
let ro: ResizeObserver | null = null

function onScroll(): void {
  if (!containerEl.value) return
  scrollState.top = containerEl.value.scrollTop
}
function measure(): void {
  if (!containerEl.value) return
  scrollState.height = containerEl.value.clientHeight
  scrollState.width = containerEl.value.clientWidth
}

onMounted(() => {
  measure()
  ro = new ResizeObserver(measure)
  if (containerEl.value) ro.observe(containerEl.value)
  window.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
  ro?.disconnect()
  window.removeEventListener('keydown', onKeydown)
})

interface CardPos {
  x: number
  y: number
  w: number
  h: number
  col: number
}

const META_H = 46
const GAP = 10
const PAD = 12

/** 瀑布流布局:按原始宽高比分列,最短列优先 */
const layout = computed<{ positions: CardPos[]; totalH: number; cols: number; colW: number }>(() => {
  const arr = items.value
  const w = scrollState.width
  if (!w || !arr.length) return { positions: [], totalH: PAD * 2, cols: 1, colW: 0 }
  const cols = Math.max(1, Math.round((w - PAD * 2 + GAP) / (ui.thumbSize + GAP)))
  const colW = Math.floor((w - PAD * 2 - GAP * (cols - 1)) / cols)
  const colH = new Array<number>(cols).fill(PAD)
  const positions: CardPos[] = new Array(arr.length)
  for (let i = 0; i < arr.length; i++) {
    const a = arr[i]
    const ar = a.width && a.height ? a.width / a.height : 1
    let c = 0
    for (let k = 1; k < cols; k++) {
      if (colH[k] < colH[c] - 0.5) c = k
    }
    const h = Math.round(colW / (ar || 1)) + META_H
    positions[i] = { x: PAD + c * (colW + GAP), y: colH[c], w: colW, h, col: c }
    colH[c] += h + GAP
  }
  const totalH = Math.max(...colH) + PAD
  return { positions, totalH, cols, colW }
})

/** 列表行高 */
const ROW_H = 52
const listTotalH = computed(() => items.value.length * ROW_H + 8)

/** 可视窗口裁剪(块跳跃 + 逐项检测配合 overscan) */
const OVERSCAN = 500
const visible = computed<{ asset: Asset; index: number; pos: CardPos | null }[]>(() => {
  const arr = items.value
  const top = scrollState.top - OVERSCAN
  const bottom = scrollState.top + scrollState.height + OVERSCAN
  const out: { asset: Asset; index: number; pos: CardPos | null }[] = []
  if (ui.viewMode === 'waterfall') {
    const p = layout.value.positions
    const BLOCK = 64
    for (let b = 0; b < arr.length; b += BLOCK) {
      let minY = Infinity
      let maxY = -Infinity
      const end = Math.min(b + BLOCK, arr.length)
      for (let i = b; i < end; i++) {
        minY = Math.min(minY, p[i].y)
        maxY = Math.max(maxY, p[i].y + p[i].h)
      }
      if (maxY < top || minY > bottom) continue
      for (let i = b; i < end; i++) {
        if (p[i].y + p[i].h >= top && p[i].y <= bottom) {
          out.push({ asset: arr[i], index: i, pos: p[i] })
        }
      }
    }
  } else {
    const first = Math.max(0, Math.floor(top / ROW_H))
    const last = Math.min(arr.length - 1, Math.ceil(bottom / ROW_H))
    for (let i = first; i <= last; i++) {
      out.push({ asset: arr[i], index: i, pos: null })
    }
  }
  return out
})

// 重置滚动位置:范围/筛选变化时
watch(
  () => [ui.scope, ui.scopeAlbumId, ui.page, ui.viewMode, ui.filters, ui.search],
  () => {
    if (containerEl.value) containerEl.value.scrollTop = 0
    ui.clearSelection()
  },
  { deep: true }
)

// ---------- 选择与交互?----------
function isSelected(id: number): boolean {
  return ui.selection.includes(id)
}

function cardClick(a: Asset, e: MouseEvent): void {
  // 右键菜单还开着时,本次点击只负责关菜单,不穿透选中(与点空白行为一致)
  if (ctx.open) {
    closeCtx()
    return
  }
  ui.detailsAssetId = a.id
  const mode = e.ctrlKey || e.metaKey ? 'toggle' : e.shiftKey ? 'range' : 'replace'
  ui.select(a.id, mode, orderedIds.value)
}

function cardDblClick(a: Asset): void {
  ui.openPreview(a.id)
}

function toggleFav(a: Asset): void {
  void window.mv.assets
    .update(a.id, { favorite: !a.favorite })
    .then((full) => lib.patchLocal(a.id, full))
    .catch((e) => {
      toast.error((e as Error).message)
    })
}

function quickRate(a: Asset, r: number): void {
  const next = a.rating === r ? 0 : r
  void window.mv.assets
    .update(a.id, { rating: next })
    .then((full) => lib.patchLocal(a.id, full))
    .catch((e) => toast.error((e as Error).message))
}

// 框选(坐标统一用内容坐标:视口坐标 + scrollTop)
const marquee = reactive({
  active: false,
  additive: false,
  x0: 0,
  y0: 0,
  x1: 0,
  y1: 0,
  base: [] as number[]
})

function gridMouseDown(e: MouseEvent): void {
  if (e.button !== 0) return
  const el = containerEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  marquee.active = true
  marquee.additive = e.ctrlKey || e.metaKey
  marquee.x0 = marquee.x1 = e.clientX - rect.left
  marquee.y0 = marquee.y1 = e.clientY - rect.top + el.scrollTop
  marquee.base = marquee.additive ? [...ui.selection] : []
  if (!marquee.additive) ui.clearSelection()
  window.addEventListener('mousemove', marqueeMove)
  window.addEventListener('mouseup', marqueeUp)
}

function marqueeMove(e: MouseEvent): void {
  const el = containerEl.value
  if (!el || !marquee.active) return
  const rect = el.getBoundingClientRect()
  marquee.x1 = e.clientX - rect.left
  marquee.y1 = e.clientY - rect.top + el.scrollTop
  marqueeHit()
}

function marqueeHit(): void {
  const x0 = Math.min(marquee.x0, marquee.x1)
  const x1 = Math.max(marquee.x0, marquee.x1)
  const y0 = Math.min(marquee.y0, marquee.y1)
  const y1 = Math.max(marquee.y0, marquee.y1)
  if (x1 - x0 < 4 && y1 - y0 < 4) return
  const hit: number[] = [...marquee.base]
  const arr = items.value
  if (ui.viewMode === 'waterfall') {
    const p = layout.value.positions
    for (let i = 0; i < arr.length; i++) {
      const c = p[i]
      if (c.x + c.w >= x0 && c.x <= x1 && c.y + c.h >= y0 && c.y <= y1) hit.push(arr[i].id)
    }
  } else {
    const first = Math.max(0, Math.floor(y0 / ROW_H))
    const last = Math.min(arr.length - 1, Math.floor(y1 / ROW_H))
    for (let i = first; i <= last; i++) hit.push(arr[i].id)
  }
  ui.selection = [...new Set(hit)]
}

function marqueeUp(): void {
  marquee.active = false
  window.removeEventListener('mousemove', marqueeMove)
  window.removeEventListener('mouseup', marqueeUp)
}

// ---------- 键盘导航 ----------
function anyOverlayOpen(): boolean {
  // 对话框用 DOM 探测:同一个 Esc 事件里,遮罩自己的处理器可能已把 store 状态关掉,
  // 但 DOM 要等下一帧才移除,窗口级处理器仍应视为"有遮挡"而不清空选择
  return (
    ui.preview.open ||
    ui.editor.open ||
    ui.settingsOpen ||
    ui.appearanceOpen ||
    ui.compareOpen ||
    ui.deleteConfirm !== null ||
    importFlow.stage === 'confirm' ||
    importFlow.stage === 'running' ||
    importFlow.stage === 'report' ||
    ctx.open ||
    document.querySelector('.dlg-mask') !== null
  )
}

function currentIdx(): number {
  const cur = ui.selection.length ? ui.selection[ui.selection.length - 1] : ui.detailsAssetId
  if (cur == null) return -1
  return orderedIds.value.indexOf(cur)
}

function scrollToIndex(i: number): void {
  const el = containerEl.value
  if (!el) return
  if (ui.viewMode === 'waterfall') {
    const p = layout.value.positions[i]
    if (!p) return
    el.scrollTo({ top: Math.max(0, p.y - el.clientHeight / 2 + p.h / 2), behavior: 'smooth' })
  } else {
    el.scrollTo({ top: Math.max(0, i * ROW_H - el.clientHeight / 2 + ROW_H / 2), behavior: 'smooth' })
  }
}

function moveCursor(delta: number, sameCol = false): void {
  const arr = items.value
  if (!arr.length) return
  let i = currentIdx()
  if (i < 0) {
    i = 0
  } else if (sameCol && ui.viewMode === 'waterfall') {
    const p = layout.value.positions
    const cur = p[i]
    // 同列中找上/下一个
    let j = i + delta
    while (j >= 0 && j < arr.length && p[j].col !== cur.col) j += delta
    if (j < 0 || j >= arr.length) return
    i = j
  } else {
    i = Math.max(0, Math.min(arr.length - 1, i + delta))
  }
  const id = arr[i].id
  if (shiftHeld) {
    ui.select(id, 'range', orderedIds.value)
  } else {
    ui.selection = [id]
    ui.anchorId = id
  }
  ui.detailsAssetId = id
  scrollToIndex(i)
}

let shiftHeld = false

function onKeydown(e: KeyboardEvent): void {
  if (anyOverlayOpen()) return
  shiftHeld = e.shiftKey
  const target = e.target as HTMLElement
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
    // 输入框内的按键不拦截
    return
  }
  switch (e.key) {
    case 'ArrowLeft':
      e.preventDefault()
      moveCursor(-1)
      break
    case 'ArrowRight':
      e.preventDefault()
      moveCursor(1)
      break
    case 'ArrowUp':
      e.preventDefault()
      moveCursor(-1, true)
      break
    case 'ArrowDown':
      e.preventDefault()
      moveCursor(1, true)
      break
    case 'j':
    case 'J':
      e.preventDefault()
      moveCursor(1)
      break
    case 'k':
    case 'K':
      e.preventDefault()
      moveCursor(-1)
      break
    case ' ':
      e.preventDefault()
      openCurrentPreview()
      break
    case 'a':
    case 'A':
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        ui.selection = [...orderedIds.value]
      }
      break
    case 'Escape':
      ui.clearSelection()
      break
    case 'Delete':
      if (ui.selection.length) {
        e.preventDefault()
        ui.deleteConfirm = ui.isTrash ? 'system' : 'trash'
      }
      break
  }
}

function openCurrentPreview(): void {
  const i = currentIdx()
  if (i >= 0) ui.openPreview(items.value[i].id)
}

// ---------- 右键菜单 ----------
const ctx = reactive<{
  open: boolean
  x: number
  y: number
  asset: Asset | null
}>({ open: false, x: 0, y: 0, asset: null })

function cardContextMenu(a: Asset, e: MouseEvent): void {
  e.preventDefault()
  if (!ui.selection.includes(a.id)) {
    ui.select(a.id, 'replace')
    ui.detailsAssetId = a.id
  }
  ctx.open = true
  ctx.x = e.clientX
  ctx.y = e.clientY
  ctx.asset = a
}

function closeCtx(): void {
  ctx.open = false
}

function ctxFav(): void {
  const a = ctx.asset
  closeCtx()
  if (a) void toggleFav(a)
}

function ctxEdit(): void {
  const a = ctx.asset
  closeCtx()
  if (a) ui.openEditor(a.id)
}

function ctxCopyPath(): void {
  const a = ctx.asset
  closeCtx()
  if (a) void navigator.clipboard.writeText(a.filePath)
}

function ctxShowInFolder(): void {
  const a = ctx.asset
  closeCtx()
  if (a) void window.mv.assets.showInFolder(a.id)
}

async function ctxToTrash(): Promise<void> {
  const ids = [...ui.selection]
  closeCtx()
  const results = await window.mv.assets.toTrash(ids)
  const failed = results.filter((r) => !r.ok)
  if (failed.length) toast.error(`${failed[0].error}`)
  ui.clearSelection()
  ui.detailsAssetId = null
}

function ctxCompare(): void {
  const ids = ui.selection.length > 1 ? [...ui.selection] : [ctx.asset!.id]
  closeCtx()
  const r = tray.add(ids)
  if (!r.ok && r.msg) toast.error(r.msg)
}

function ctxRemoveCompare(): void {
  const id = ctx.asset!.id
  closeCtx()
  tray.remove(id)
}

// 空状态
const emptyKind = computed<'' | 'no-assets' | 'no-results' | 'trash-empty'>(() => {
  if (items.value.length) return ''
  if (ui.scope === 'trash') return 'trash-empty'
  if (lib.allCount === 0) return 'no-assets'
  return 'no-results'
})
</script>

<template>
  <div class="grid-root">
    <!-- 列表表头(固定在滚动区域之外) -->
    <div v-if="ui.viewMode === 'list' && items.length" class="list-header">
      <div class="cell thumb-cell" />
      <div class="cell name-cell">文件夹</div>
      <div class="cell dim-cell">尺寸</div>
      <div class="cell">大小</div>
      <div class="cell">评分</div>
      <div class="cell">收藏</div>
      <div class="cell time-cell">导入时间</div>
    </div>
    <div
      ref="containerEl"
      class="grid-container"
      :class="{ 'is-list': ui.viewMode === 'list' }"
      @scroll.passive="onScroll"
      @mousedown="gridMouseDown"
    >
      <!-- 瀑布流视图 -->
      <div
        v-if="ui.viewMode === 'waterfall' && items.length"
        key="wf"
        class="wf-canvas view-fade"
        :style="{ height: layout.totalH + 'px' }"
      >
        <div
          v-for="v in visible"
          :key="v.asset.id"
          class="card"
          :class="{ selected: isSelected(v.asset.id) }"
          :style="v.pos ? { left: v.pos.x + 'px', top: v.pos.y + 'px', width: v.pos.w + 'px' } : {}"
          @mousedown.stop
          @click="cardClick(v.asset, $event)"
          @dblclick="cardDblClick(v.asset)"
          @contextmenu="cardContextMenu(v.asset, $event)"
        >
          <div class="thumb-box" :style="{ height: (v.pos ? v.pos.h - META_H : 180) + 'px' }">
            <template v-if="!v.asset.missing && v.asset.thumbDone === 1">
              <!-- 接近可视区才加载(v-lazy-img),加载完成前露出底层骨架 -->
              <div class="thumb-skeleton skeleton" />
              <img
                v-lazy-img="thumbUrl(v.asset)"
                class="thumb lazy"
                decoding="async"
                draggable="false"
                alt=""
              />
            </template>
            <div v-else-if="v.asset.missing" class="thumb-missing">
              <Icon name="warning" :size="22" />
              <span>文件缺失</span>
            </div>
            <div v-else class="thumb-skeleton skeleton" />
            <span v-if="v.asset.kind === 'video'" class="kind-badge">
              <Icon name="video" :size="11" />视频
            </span>
            <div class="check-badge" aria-hidden="true"><Icon name="check" :size="13" /></div>
            <div class="hover-bar" @mousedown.stop @click.stop>
              <RatingStars
                :model-value="v.asset.rating"
                size="sm"
                @set="(r) => quickRate(v.asset, r)"
              />
              <button
                class="fav-btn"
                :class="{ on: v.asset.favorite }"
                title="收藏"
                @click="toggleFav(v.asset)"
              >
                <Icon name="heart" :size="14" :filled="v.asset.favorite" />
              </button>
            </div>
          </div>
          <div class="card-meta">
            <div class="card-name" :title="v.asset.fileName">{{ v.asset.fileName }}</div>
            <div class="card-sub">
              <template v-if="ui.isTrash">
                <!-- 回收站卡片:尺寸 + 颜色 + 标签 + 评分 -->
                <span>{{ v.asset.width }}×{{ v.asset.height }}</span>
                <span v-if="v.asset.colors?.length" class="card-colors">
                  <i
                    v-for="(c, ci) in v.asset.colors.slice(0, 6)"
                    :key="ci"
                    :style="{ background: rgbCss(c) }"
                  />
                </span>
                <span v-if="v.asset.tagIds.length" class="card-tags-n">{{ v.asset.tagIds.length }} 标签</span>
                <span v-if="v.asset.rating" class="card-rating">★{{ v.asset.rating }}</span>
              </template>
              <template v-else>{{ v.asset.width }}×{{ v.asset.height }}</template>
            </div>
          </div>
        </div>
      </div>

      <!-- 列表 -->
      <div v-else-if="items.length" class="list-canvas" :style="{ height: listTotalH + 'px' }">
        <div
          v-for="v in visible"
          :key="v.asset.id"
          class="row"
          :class="{ selected: isSelected(v.asset.id) }"
          :style="{ top: v.index * ROW_H + 4 + 'px' }"
          @mousedown.stop
          @click="cardClick(v.asset, $event)"
          @dblclick="cardDblClick(v.asset)"
          @contextmenu="cardContextMenu(v.asset, $event)"
        >
          <div class="check-badge row-check" aria-hidden="true"><Icon name="check" :size="12" /></div>
          <div class="cell thumb-cell">
            <template v-if="!v.asset.missing && v.asset.thumbDone === 1">
              <div class="skeleton list-skel" />
              <img v-lazy-img="thumbUrl(v.asset)" class="lazy" decoding="async" alt="" />
            </template>
            <Icon v-else-if="v.asset.missing" name="warning" :size="14" />
            <div v-else class="skeleton list-skel" />
            <span v-if="v.asset.kind === 'video'" class="kind-badge sm"><Icon name="video" :size="9" /></span>
          </div>
          <div class="cell name-cell" :title="v.asset.fileName">
            <Icon v-if="v.asset.favorite" name="heart" :size="11" filled class="fav-inline" />
            {{ v.asset.fileName }}
          </div>
          <div class="cell dim-cell">{{ v.asset.width }}×{{ v.asset.height }}</div>
          <div class="cell">{{ fmtBytes(v.asset.fileSize) }}</div>
          <div class="cell">
            <span v-if="v.asset.rating" class="row-stars">{{ '★'.repeat(v.asset.rating) }}</span>
            <span v-else class="text-faint">-</span>
          </div>
          <div class="cell">
            <Icon v-if="v.asset.favorite" name="heart" :size="13" filled class="fav-on" />
            <span v-else class="text-faint">-</span>
          </div>
          <div class="cell time-cell">{{ new Date(v.asset.importedAt).toLocaleDateString() }}</div>
        </div>
      </div>

      <!-- 框选矩形(内容坐标,随内容滚动) -->
      <div
        v-if="marquee.active"
        class="marquee-rect"
        :style="{
          left: Math.min(marquee.x0, marquee.x1) + 'px',
          top: Math.min(marquee.y0, marquee.y1) + 'px',
          width: Math.abs(marquee.x1 - marquee.x0) + 'px',
          height: Math.abs(marquee.y1 - marquee.y0) + 'px'
        }"
      />

      <!-- 空状态 -->
      <div v-if="emptyKind" class="empty-state">
        <div class="art"><Icon :name="emptyKind === 'trash-empty' ? 'trash' : 'image'" :size="40" /></div>
        <h3 v-if="emptyKind === 'no-assets'">图库还是空的</h3>
        <h3 v-else-if="emptyKind === 'trash-empty'">回收站是空的</h3>
        <h3 v-else>没有符合条件的素材</h3>
        <p v-if="emptyKind === 'no-assets'">点击上方「导入素材」或直接把图片 / 视频拖进窗口</p>
        <p v-else-if="emptyKind === 'no-results'">试试调整筛选条件或搜索关键字</p>
      </div>
    </div>

    <!-- 右键菜单 -->
    <Teleport to="body">
      <div v-if="ctx.open" class="popover-backdrop" @mousedown="closeCtx(); ui.selection = []" @contextmenu.prevent />
      <div v-if="ctx.open && ctx.asset" class="popover ctx-menu" :style="{ left: ctx.x + 'px', top: ctx.y + 'px' }">
        <div class="popover-item" @click="closeCtx(); cardDblClick(ctx.asset!)">
          <Icon name="eye" :size="14" /> 打开预览
        </div>
        <div class="popover-item" @click="ctxFav">
          <Icon name="heart" :size="14" :filled="ctx.asset?.favorite" />
          {{ ctx.asset?.favorite ? '取消收藏' : '收藏' }}
        </div>
        <div v-if="ctx.asset?.kind === 'image' && !ctx.asset?.missing && !ui.isTrash" class="popover-item" @click="ctxEdit">
          <Icon name="edit" :size="14" /> 编辑图片
        </div>
        <div class="popover-item" @click="ctxCopyPath">
          <Icon name="copy" :size="14" /> 复制文件路径
        </div>
        <div class="popover-item" @click="ctxShowInFolder">
          <Icon name="folder" :size="14" /> 在资源管理器中显示
        </div>
        <div class="popover-sep" />
        <div v-if="!tray.ids.includes(ctx.asset.id)" class="popover-item" @click="ctxCompare">
          <Icon name="compare" :size="14" /> 加入对比
        </div>
        <div v-else class="popover-item" @click="ctxRemoveCompare">
          <Icon name="compare" :size="14" /> 移出对比
        </div>
        <div v-if="!ui.isTrash" class="popover-item danger" @click="ctxToTrash">
          <Icon name="trash" :size="14" /> 删除(移入回收站)
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* 右键菜单遮罩:必须盖住全窗口,点空白关菜单+取消选中 */
.popover-backdrop {
  position: fixed;
  inset: 0;
  z-index: 299;
}

.grid-root {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
}
.grid-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  position: relative;
}
.wf-canvas {
  position: relative;
}
.card {
  position: absolute;
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--panel);
  border: 1px solid var(--border);
  cursor: default;
  /* 只过渡 transform(合成器动画);box-shadow 逐帧重绘是悬停/滚动发卡的来源,选中与悬停阴影瞬时应用 */
  transition: border-color 0.15s, transform 0.18s;
  contain: layout style;
}
.card:hover {
  border-color: var(--border-strong);
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.28);
}
.card.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent), 0 4px 14px rgba(79, 124, 255, 0.22);
}
/* Eagle 式选中角标:弹性缩放出现 */
.check-badge {
  position: absolute;
  left: 8px;
  top: 8px;
  z-index: 4;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: scale(0);
  opacity: 0;
  transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.12s;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  pointer-events: none;
}
.card.selected .check-badge,
.row.selected .check-badge {
  transform: scale(1);
  opacity: 1;
}
.row-check {
  position: static;
  width: 16px;
  height: 16px;
  flex: none;
  box-shadow: none;
  align-self: center;
}
.row .check-badge svg {
  display: none;
}
.row.selected .check-badge svg {
  display: block;
}
.card.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
}
.thumb-box {
  position: relative;
  width: 100%;
  background: var(--bg-glass);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
.thumb {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}
.thumb.lazy,
.thumb-cell img.lazy {
  transition: opacity 0.18s ease;
  position: relative;
  z-index: 1;
}
.thumb-skeleton {
  position: absolute;
  inset: 0;
}
.thumb-skeleton ~ .thumb,
.thumb-skeleton + .thumb.lazy {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.thumb.lazy-broken {
  opacity: 0 !important;
}
.thumb-cell img.lazy {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 4px;
}
.thumb-skeleton {
  position: absolute;
  inset: 0;
}
.thumb-missing {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: var(--text-faint);
  font-size: 11px;
}
.kind-badge {
  position: absolute;
  left: 6px;
  top: 6px;
  /* 同悬停条:不能被 z-index:1 的缩略图盖住 */
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: rgba(0, 0, 0, 0.62);
  color: #fff;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  pointer-events: none;
}
.kind-badge.sm {
  padding: 1px 3px;
}
.hover-bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  /* 缩略图(.thumb.lazy)为盖住骨架带了 z-index:1,悬停条必须更高才能接到点击 */
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 5px 7px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.72));
  opacity: 0;
  transition: opacity 0.15s;
}
.card:hover .hover-bar {
  opacity: 1;
}
.fav-btn {
  color: #fff;
  display: flex;
  padding: 2px;
}
.fav-btn.on {
  color: #ff6b81;
}
.card-meta {
  padding: 7px 9px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.card-name {
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.card-sub {
  font-size: 10.5px;
  color: var(--text-faint);
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.card-colors {
  display: inline-flex;
  gap: 2px;
}
.card-colors i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  display: inline-block;
}
.card-tags-n {
  font-size: 9.5px;
  background: var(--bg-glass-strong);
  border-radius: 4px;
  padding: 0 4px;
}
.card-rating {
  color: var(--star);
  font-size: 9.5px;
}

/* 列表视图 */
.list-header {
  display: flex;
  align-items: center;
  padding: 0 14px 6px 14px;
  gap: 10px;
  font-size: 11px;
  color: var(--text-faint);
  border-bottom: 1px solid var(--border);
  flex: none;
}
.list-canvas {
  position: relative;
  margin-top: 4px;
}
.row {
  position: absolute;
  left: 14px;
  right: 14px;
  height: 44px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid transparent;
}
.row:hover {
  background: var(--bg-glass);
}
.row.selected {
  background: var(--accent-soft);
  border-color: rgba(79, 124, 255, 0.3);
}
.cell {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12.5px;
  color: var(--text-dim);
}
.thumb-cell {
  flex: none;
  width: 44px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.thumb-cell img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 4px;
}
.list-skel {
  width: 100%;
  height: 100%;
  border-radius: 4px;
}
.name-cell {
  flex: 2.2;
  color: var(--text);
  display: flex;
  align-items: center;
  gap: 5px;
}
.dim-cell {
  flex: none;
  width: 90px;
}
.time-cell {
  flex: none;
  width: 96px;
  text-align: right;
}
.row-stars {
  color: var(--star);
  font-size: 12px;
  letter-spacing: 1px;
}
.fav-on {
  color: #ff6b81;
}
.fav-inline {
  color: #ff6b81;
  flex: none;
}
.text-faint {
  color: var(--text-faint);
}

.marquee-rect {
  position: absolute;
  border: 1px solid var(--accent);
  background: var(--accent-soft);
  pointer-events: none;
  z-index: 10;
}
.ctx-menu .danger {
  color: var(--danger);
}
</style>
