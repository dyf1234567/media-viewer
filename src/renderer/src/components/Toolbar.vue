<script setup lang="ts">
import { computed, ref } from 'vue'
import { useUiStore, type SortKey } from '../stores/ui'
import { useLibraryStore } from '../stores/library'
import { useToastStore } from '../stores/toast'
import { startImportConfirm } from '../composables/importFlow'
import { scopeFilter, applyFilters, applySort, countFilters } from '../util/pipeline'
import Icon from './Icon.vue'

const ui = useUiStore()
const lib = useLibraryStore()
const toast = useToastStore()

const plusMenuOpen = ref(false)
const plusMenuX = ref(0)
const plusMenuY = ref(0)

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'imported', label: '导入顺序' },
  { key: 'name-asc', label: '名称升序' },
  { key: 'name-desc', label: '名称降序' },
  { key: 'size-desc', label: '文件从大到小' },
  { key: 'rating-desc', label: '评分从高到低' },
  { key: 'modified', label: '最近修改' }
]

function openPlusMenu(e: MouseEvent): void {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  plusMenuX.value = r.left
  plusMenuY.value = r.bottom + 6
  plusMenuOpen.value = true
}

async function pickFiles(mode: 'reference' | 'managed'): Promise<void> {
  plusMenuOpen.value = false
  const files = await window.mv.dialog.pickFiles()
  if (!files.length) return
  startImportConfirm(
    files.map((p) => ({ path: p, isDir: false })),
    mode
  )
}

async function pickDirs(): Promise<void> {
  plusMenuOpen.value = false
  const dirs = await window.mv.dialog.pickDirs()
  if (!dirs.length) return
  startImportConfirm(
    dirs.map((d) => ({ path: d, isDir: true })),
    'reference'
  )
}

function randomBrowse(): void {
  const scoped = scopeFilter(lib.assets, ui.scope, ui.scopeAlbumId, null)
  const filtered = applyFilters(scoped, ui.filters, ui.search)
  const shuffled = [...filtered]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  const pick = shuffled.slice(0, 50).map((a) => a.id)
  if (!pick.length) {
    toast.error('当前范围没有可浏览的素材')
    return
  }
  ui.startRandom(pick)
  ui.page = 'library'
}

function thumbStep(delta: number): void {
  ui.thumbSize = Math.max(100, Math.min(400, Math.round(ui.thumbSize / 10) * 10 + delta))
}

const sortLabel = computed(() => SORTS.find((s) => s.key === ui.sortKey)?.label ?? '')
const activeFilterCount = computed(() => countFilters(ui.filters))
const sortMenuOpen = ref(false)
const sortMenuX = ref(0)
const sortMenuY = ref(0)
function openSortMenu(e: MouseEvent): void {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  sortMenuX.value = r.left
  sortMenuY.value = r.bottom + 6
  sortMenuOpen.value = true
}

function closePopovers(): void {
  plusMenuOpen.value = false
  sortMenuOpen.value = false
}
</script>

<template>
  <div class="toolbar">
    <div class="tb-group">
      <button class="plus-btn" title="导入素材、添加目录、随机浏览、查找相似图片…" @click="openPlusMenu">
        <Icon name="plus" :size="17" />
      </button>
    </div>

    <div class="tb-search">
      <Icon name="search" :size="14" />
      <input
        v-model="ui.search"
        type="text"
          placeholder="搜索文件名…"
        spellcheck="false"
      />
      <button v-if="ui.search" class="clear-btn" title="清空搜索" @click="ui.search = ''">
        <Icon name="x" :size="12" />
      </button>
    </div>

    <!-- 排序 / 视图 / 缩略图大小:窗口够宽时与搜索同排,不够时整组换行并靠右,保持整齐 -->
    <div class="tb-group tb-right">
      <button
        class="vt-btn filter-toggle"
        :class="{ active: ui.filterPanelOpen, 'has-filters': activeFilterCount > 0 }"
        :title="activeFilterCount ? `${activeFilterCount} 个筛选条件生效,点击${ui.filterPanelOpen ? '收起' : '展开'}筛选` : (ui.filterPanelOpen ? '收起筛选' : '展开筛选')"
        @click="ui.filterPanelOpen = !ui.filterPanelOpen"
      >
        <Icon name="filter" :size="14" />
        <span v-if="activeFilterCount" class="filter-badge">{{ activeFilterCount }}</span>
      </button>
      <button class="btn" :disabled="ui.isRandom" :title="ui.isRandom ? '随机浏览模式下排序已禁用' : '排序方式'" @click="openSortMenu">
        {{ sortLabel }}
        <Icon name="chevron-down" :size="12" />
      </button>
      <div class="view-toggle">
        <button
          class="vt-btn"
          :class="{ active: ui.viewMode === 'waterfall' }"
          title="瀑布流视图"
          @click="ui.viewMode = 'waterfall'"
        >
          <Icon name="grid" :size="14" />
        </button>
        <button
          class="vt-btn"
          :class="{ active: ui.viewMode === 'list' }"
          title="列表视图"
          @click="ui.viewMode = 'list'"
        >
          <Icon name="list" :size="14" />
        </button>
      </div>
      <div v-if="ui.viewMode === 'waterfall'" class="size-ctrl">
        <button class="vt-btn" title="缩小缩略图" @click="thumbStep(-20)">
          <Icon name="minus" :size="13" />
        </button>
        <input
          :value="ui.thumbSize"
          type="range"
          min="100"
          max="400"
          step="10"
          title="缩略图大小"
          @input="ui.thumbSize = Number(($event.target as HTMLInputElement).value)"
        />
        <button class="vt-btn" title="放大缩略图" @click="thumbStep(20)">
          <Icon name="plus" :size="13" />
        </button>
      </div>
      <button class="btn icon-only" title="收起 / 展开详情面板" @click="ui.panelCollapsed = !ui.panelCollapsed">
        <Icon name="info" :size="15" />
      </button>
    </div>

    <Teleport to="body">
      <div v-if="plusMenuOpen || sortMenuOpen" class="popover-backdrop" @mousedown="closePopovers" @contextmenu.prevent />
      <div v-if="plusMenuOpen" class="popover" :style="{ left: plusMenuX + 'px', top: plusMenuY + 'px' }">
        <div class="popover-label">导入</div>
        <div class="popover-item" @click="pickFiles('reference')">
          <Icon name="upload" :size="14" />
          引用原文件          <span class="hint-inline">不复制、不改动原文件</span>
        </div>
        <div class="popover-item" @click="pickFiles('managed')">
          <Icon name="save" :size="14" />
          存进库          <span class="hint-inline">复制一份纳入图库管理</span>
        </div>
        <div class="popover-item" @click="pickDirs()">
          <Icon name="folder-plus" :size="14" />
          添加目录          <span class="hint-inline">递归扫描,自动建同名相册</span>
        </div>
        <div class="popover-sep" />
        <div class="popover-label">浏览</div>
        <div class="popover-item" :class="{ disabled: ui.isRandom }" @click="!ui.isRandom && (randomBrowse(), closePopovers())">
          <Icon name="shuffle" :size="14" />
          随机浏览
          <span class="hint-inline">打乱当前范围,取前 50 张</span>
        </div>
        <div class="popover-item" @click="ui.similarOpen = true; closePopovers()">
          <Icon name="search" :size="14" />
          查找相似图片
          <span class="hint-inline">按感知指纹比对全库</span>
        </div>
        <div v-if="ui.isRandom" class="popover-item" @click="ui.setScope('all'); closePopovers()">
          <Icon name="x" :size="14" />
          退出随机浏览
        </div>
      </div>
      <div v-if="sortMenuOpen" class="popover" :style="{ left: sortMenuX + 'px', top: sortMenuY + 'px' }">
        <div
          v-for="s in SORTS"
          :key="s.key"
          class="popover-item"
          :class="{ active: ui.sortKey === s.key }"
          @click="ui.sortKey = s.key; closePopovers()"
        >
          {{ s.label }}
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px 12px;
  padding: 10px 14px 8px;
  flex: none;
  flex-wrap: wrap;
}
.tb-group {
  display: flex;
  align-items: center;
  gap: 8px;
}
.tb-right {
  margin-left: auto;
}
/* 圆形主操作按钮(Apple Photos 风格):所有导入/浏览操作收进加号菜单 */
.plus-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  flex: none;
}
.plus-btn:hover {
  filter: brightness(1.12);
}
.plus-btn:active {
  transform: scale(0.94);
}
.popover-sep {
  height: 1px;
  background: var(--border);
  margin: 5px 8px;
}
.popover-item .hint-inline {
  margin-left: auto;
}
/* 漏斗筛选按钮:激活条件时带数字角标 */
.filter-toggle {
  position: relative;
}
.filter-toggle.has-filters {
  color: var(--accent);
}
.filter-badge {
  position: absolute;
  top: -3px;
  right: -3px;
  min-width: 13px;
  height: 13px;
  border-radius: 7px;
  background: var(--accent);
  color: #fff;
  font-size: 9px;
  line-height: 13px;
  text-align: center;
  padding: 0 3px;
}
.tb-search {
  flex: 1;
  min-width: 120px;
  max-width: 250px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-glass);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0 10px;
  color: var(--text-faint);
}
.tb-search input {
  flex: 1;
  background: none;
  border: 0;
  padding: 7px 0;
  min-width: 0;
}
.clear-btn {
  display: flex;
  color: var(--text-dim);
  padding: 3px;
}
.clear-btn:hover {
  color: var(--text);
}
.view-toggle,
.size-ctrl {
  display: flex;
  align-items: center;
  background: var(--bg-glass);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 2px;
  gap: 2px;
}
.vt-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 26px;
  border-radius: 5px;
  color: var(--text-dim);
}
.vt-btn:hover {
  color: var(--text);
}
.vt-btn.active {
  background: var(--accent-soft);
  color: var(--accent);
}
.size-ctrl input[type='range'] {
  width: 80px;
}
.popover-item.disabled {
  opacity: 0.45;
  cursor: default;
}
.popover-item.disabled:hover {
  background: none;
}
.hint-inline {
  font-size: 10.5px;
  color: var(--text-faint);
  margin-left: 4px;
}
.popover-backdrop {
  position: fixed;
  inset: 0;
  z-index: 299;
}
</style>
