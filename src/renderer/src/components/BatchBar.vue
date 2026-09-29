?<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useUiStore } from '../stores/ui'
import { useLibraryStore } from '../stores/library'
import { useToastStore } from '../stores/toast'
import Icon from './Icon.vue'

const ui = useUiStore()
const lib = useLibraryStore()
const toast = useToastStore()

const selected = computed(() =>
  ui.selection.map((id) => lib.byId.get(id)).filter(Boolean) as NonNullable<ReturnType<typeof lib.byId.get>>[]
)

const hasReference = computed(() => selected.value.some((a) => a.storageMode === 'reference'))
const allFav = computed(() => selected.value.length > 0 && selected.value.every((a) => a.favorite))

// 批量整理菜单
const organize = reactive({ open: false, x: 0, y: 0 })
const tagQuery = ref('')
const newAlbumName = ref('')
const busy = ref(false)

function openOrganize(e: MouseEvent): void {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  organize.x = r.left
  organize.y = r.bottom + 6
  organize.open = true
}

async function batchFav(): Promise<void> {
  const target = !allFav.value
  let ok = 0
  for (const a of selected.value) {
    try {
      const full = await window.mv.assets.update(a.id, { favorite: target })
      lib.patchLocal(a.id, full)
      ok++
    } catch {
      /* 单项失败继续 */
    }
  }
  if (ok < selected.value.length) toast.error(`已处理?${ok} / ${selected.value.length} 项`)
}

async function batchToManaged(): Promise<void> {
  busy.value = true
  try {
    const r = await window.mv.assets.convertToManaged([...ui.selection])
    if (r.ok < r.total) {
      toast.error(`已处理 ${r.ok} / ${r.total} 项${r.errors.length ? `:${r.errors[0]}` : ''}`)
    } else {
      toast.success(`已将 ${r.ok} 个素材存进库`)
    }
  } catch (e) {
    toast.error((e as Error).message)
  } finally {
    busy.value = false
  }
}

async function batchTrash(): Promise<void> {
  ui.deleteConfirm = null
  const results = await window.mv.assets.toTrash([...ui.selection])
  const failed = results.filter((r) => !r.ok)
  if (failed.length) toast.error(failed[0].error ?? '部分素材移入回收站失败')
  ui.clearSelection()
  ui.detailsAssetId = null
}

async function batchAddTag(name: string): Promise<void> {
  if (!name.trim()) return
  try {
    await window.mv.tags.assign([...ui.selection], name.trim())
    organize.open = false
    tagQuery.value = ''
  } catch (e) {
    toast.error((e as Error).message)
  }
}

async function batchAddAlbum(albumId: number): Promise<void> {
  try {
    await window.mv.albums.assign([...ui.selection], albumId)
    organize.open = false
  } catch (e) {
    toast.error((e as Error).message)
  }
}

async function createAlbumAndAssign(): Promise<void> {
  const name = newAlbumName.value.trim()
  if (!name) return
  try {
    const al = await window.mv.albums.create(name)
    newAlbumName.value = ''
    await batchAddAlbum(al.id)
  } catch (e) {
    toast.error((e as Error).message)
  }
}

// 批量导出
const exportState = reactive({
  open: false,
  dir: '',
  mode: 'copy' as 'copy' | 'convert',
  format: 'png' as 'png' | 'jpg' | 'webp',
  quality: 90,
  busy: false,
  report: null as { ok: number; total: number; errors: string[] } | null
})

async function pickExportDir(): Promise<void> {
  const dirs = await window.mv.dialog.pickDirs()
  if (dirs.length) exportState.dir = dirs[0]
}

async function runExport(): Promise<void> {
  if (!exportState.dir) return
  exportState.busy = true
  exportState.report = null
  try {
    exportState.report = await window.mv.assets.exportBatch([...ui.selection], {
      dir: exportState.dir,
      mode: exportState.mode,
      format: exportState.mode === 'convert' ? exportState.format : undefined,
      quality: exportState.quality
    })
  } catch (e) {
    toast.error((e as Error).message)
  } finally {
    exportState.busy = false
  }
}

// 回收站里的批量操作
async function batchRestore(): Promise<void> {
  const results = await window.mv.assets.restore([...ui.selection])
  const failed = results.filter((r) => !r.ok)
  if (failed.length) toast.error(failed[0].error ?? '部分素材恢复失败')
  ui.clearSelection()
}

async function batchDeleteForever(): Promise<void> {
  ui.deleteConfirm = null
  const results = await window.mv.assets.deleteForever([...ui.selection])
  const failed = results.filter((r) => !r.ok)
  if (failed.length) toast.error(failed[0].error ?? '部分素材删除失败')
  ui.clearSelection()
  ui.detailsAssetId = null
}

// 确认框打开时焦点落在取消键上:Enter 默认走取消,Esc/Tab 也随之可用
const trashCancelRef = ref<HTMLButtonElement | null>(null)
const sysCancelRef = ref<HTMLButtonElement | null>(null)
watch(
  () => ui.deleteConfirm,
  (v) => {
    if (!v) return
    void nextTick(() => (v === 'system' ? sysCancelRef.value : trashCancelRef.value)?.focus())
  }
)

const filteredTags = computed(() => {
  const q = tagQuery.value.trim().toLowerCase()
  return lib.tags.filter((t) => !q || t.name.toLowerCase().includes(q)).slice(0, 8)
})
</script>

<template>
  <Transition name="bar">
    <div v-if="selected.length" class="batch-bar">
      <span class="count">已选 {{ selected.length }} 项</span>
      <template v-if="!ui.isTrash">
        <button v-if="hasReference" class="bb-btn" :disabled="busy" @click="batchToManaged">
          <Icon name="save" :size="13" /> 存进库
        </button>
        <button class="bb-btn" @click="batchFav">
          <Icon name="heart" :size="13" :filled="allFav" />
          {{ allFav ? '取消收藏' : '收藏' }}
        </button>
        <button class="bb-btn" @click="openOrganize">
          <Icon name="tag" :size="13" /> 批量整理
          <Icon name="chevron-down" :size="11" />
        </button>
        <button class="bb-btn" @click="exportState.open = true; exportState.report = null">
          <Icon name="save" :size="13" /> 导出…
        </button>
        <button class="bb-btn danger" @click="ui.deleteConfirm = 'trash'">
          <Icon name="trash" :size="13" /> 移入回收站
        </button>
      </template>
      <template v-else>
        <button class="bb-btn" @click="batchRestore">
          <Icon name="refresh" :size="13" /> 恢复
        </button>
        <button class="bb-btn danger" @click="ui.deleteConfirm = 'system'">
          <Icon name="trash" :size="13" /> 删除到系统回收站
        </button>
      </template>
      <button class="bb-btn ghost" @click="ui.clearSelection()">
        <Icon name="x" :size="13" /> 取消选择
      </button>
    </div>
  </Transition>

  <!-- 批量整理弹层 -->
  <Teleport to="body">
    <div v-if="organize.open" class="popover-backdrop" @mousedown="organize.open = false" @contextmenu.prevent />
    <div v-if="organize.open" class="popover organize-pop" :style="{ left: organize.x + 'px', top: organize.y + 'px' }">
      <div class="popover-label">添加标签</div>
      <div class="tag-input-row">
        <input v-model="tagQuery" type="text" placeholder="搜索或新建标签…" spellcheck="false" />
        <button class="btn sm" :disabled="!tagQuery.trim()" @click="batchAddTag(tagQuery)">添加</button>
      </div>
      <div class="tag-suggest">
        <div
          v-for="t in filteredTags"
          :key="t.id"
          class="popover-item"
          @click="batchAddTag(t.name)"
        >
          {{ t.name }}
          <span class="badge-count">{{ t.usage }}</span>
        </div>
        <div v-if="!filteredTags.length" class="popover-label">输入新标签名后点「添加目录</div>
      </div>
      <div class="popover-label" style="margin-top: 6px">移入相册</div>
      <div class="album-scroll">
        <div
          v-for="al in lib.albums"
          :key="al.id"
          class="popover-item"
          @click="batchAddAlbum(al.id)"
        >
          <Icon name="folder" :size="13" />
          {{ al.name }}
          <span class="badge-count" style="margin-left: auto">{{ al.count }}</span>
        </div>
        <div v-if="!lib.albums.length" class="popover-label">暂无相册</div>
      </div>
      <div class="tag-input-row">
        <input v-model="newAlbumName" type="text" placeholder="新建相册并移入…" spellcheck="false" />
        <button class="btn sm" :disabled="!newAlbumName.trim()" @click="createAlbumAndAssign">创建</button>
      </div>
    </div>

    <!-- 批量导出 -->
    <div
      v-if="exportState.open"
      class="dlg-mask"
      @keydown.esc.stop="!exportState.busy && (exportState.open = false)"
      @mousedown.self="!exportState.busy && (exportState.open = false)"
    >
      <div class="dlg" style="min-width: 460px" role="dialog" aria-modal="true" aria-label="批量导出">
        <div class="dlg-head">批量导出 {{ selected.length }} 个素材</div>
        <div class="dlg-body">
          <div class="ex-row">
            <span class="ex-label">导出到</span>
            <span class="ex-dir" :title="exportState.dir">{{ exportState.dir || '未选择目录' }}</span>
            <button class="btn sm" :disabled="exportState.busy" @click="pickExportDir">选择…</button>
          </div>
          <div class="ex-row">
            <span class="ex-label">方式</span>
            <label class="ex-mode"><input v-model="exportState.mode" type="radio" value="copy" :disabled="exportState.busy" /> 原样复制</label>
            <label class="ex-mode"><input v-model="exportState.mode" type="radio" value="convert" :disabled="exportState.busy" /> 转换格式</label>
          </div>
          <div v-if="exportState.mode === 'convert'" class="ex-row">
            <span class="ex-label">格式</span>
            <select v-model="exportState.format" :disabled="exportState.busy">
              <option value="png">PNG(无损)</option>
              <option value="jpg">JPG(透明合白底)</option>
              <option value="webp">WebP</option>
            </select>
            <template v-if="exportState.format !== 'png'">
              <span class="ex-label">质量 {{ exportState.quality }}</span>
              <input v-model.number="exportState.quality" type="range" min="40" max="100" style="flex: 1" />
            </template>
          </div>
          <p class="ex-hint">同名文件自动加 (1) 序号,不覆盖目标目录里的现有文件。</p>
          <div v-if="exportState.report" class="ex-report">
            <template v-if="exportState.report.ok">
              已导出 {{ exportState.report.ok }} / {{ exportState.report.total }} 个文件。
            </template>
            <div v-for="(e, i) in exportState.report.errors.slice(0, 5)" :key="i" class="ex-err">{{ e }}</div>
          </div>
        </div>
        <div class="dlg-foot">
          <button data-cancel class="btn" :disabled="exportState.busy" @click="exportState.open = false">
            {{ exportState.report ? '关闭' : '取消' }}
          </button>
          <button class="btn primary" :disabled="exportState.busy || !exportState.dir" @click="runExport">
            {{ exportState.busy ? '导出中…' : '开始导出' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 移入回收站确认 -->
    <div
      v-if="ui.deleteConfirm === 'trash'"
      class="dlg-mask"
      @keydown.esc.stop="ui.deleteConfirm = null"
      @mousedown.self="ui.deleteConfirm = null"
    >
      <div class="dlg" style="min-width: 420px" role="dialog" aria-modal="true" aria-label="移入回收站">
        <div class="dlg-head">移入回收站</div>
        <div class="dlg-body">
          <p>以下 {{ selected.length }} 个素材将移入应用回收站(之后仍可恢复或删除到系统回收站):</p>
          <div class="file-list">
            <div v-for="a in selected" :key="a.id" class="file-item">{{ a.fileName }}</div>
          </div>
        </div>
        <div class="dlg-foot">
          <button ref="trashCancelRef" data-cancel class="btn" @click="ui.deleteConfirm = null">取消</button>
          <button class="btn danger" @click="batchTrash">移入回收站</button>
        </div>
      </div>
    </div>

    <!-- 删除到系统回收站确认 -->
    <div
      v-if="ui.deleteConfirm === 'system'"
      class="dlg-mask"
      @keydown.esc.stop="ui.deleteConfirm = null"
      @mousedown.self="ui.deleteConfirm = null"
    >
      <div class="dlg" style="min-width: 420px" role="dialog" aria-modal="true" aria-label="删除到系统回收站">
        <div class="dlg-head">删除到系统回收站</div>
        <div class="dlg-body">
          <p>以下 {{ selected.length }} 个素材将送入 Windows 回收站(之后仍可从系统回收站还原):</p>
          <div class="file-list">
            <div v-for="a in selected" :key="a.id" class="file-item">{{ a.fileName }}</div>
          </div>
        </div>
        <div class="dlg-foot">
          <button ref="sysCancelRef" data-cancel class="btn" @click="ui.deleteConfirm = null">取消</button>
          <button class="btn danger" @click="batchDeleteForever">删除</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.batch-bar {
  position: absolute;
  left: 50%;
  bottom: 46px;
  transform: translateX(-50%);
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--panel);
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  padding: 8px 10px;
  box-shadow: var(--shadow-pop);
}
.count {
  font-size: 12px;
  color: var(--text-dim);
  padding: 0 6px;
  white-space: nowrap;
}
.bb-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border-radius: 8px;
  color: var(--text);
  font-size: 12.5px;
  white-space: nowrap;
}
.bb-btn:hover:not(:disabled) {
  background: var(--bg-glass-strong);
}
.bb-btn.danger {
  color: var(--danger);
}
.bb-btn.ghost {
  color: var(--text-faint);
}
.popover-backdrop {
  position: fixed;
  inset: 0;
  z-index: 299;
}
.organize-pop {
  width: 300px;
}
.tag-input-row {
  display: flex;
  gap: 6px;
  padding: 4px 6px;
}
.tag-input-row input {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
}
.tag-suggest,
.album-scroll {
  max-height: 160px;
  overflow: auto;
}
.file-list {
  max-height: 220px;
  overflow: auto;
  background: rgba(0, 0, 0, 0.24);
  border-radius: 8px;
  padding: 8px;
  margin-top: 8px;
}
.file-item {
  font-size: 12px;
  color: var(--text-dim);
  padding: 3px 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bar-enter-active,
.bar-leave-active {
  transition: all 0.18s ease;
}
.bar-enter-from,
.bar-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(10px);
}
.ex-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 8px 0;
  font-size: 12.5px;
}
.ex-label {
  flex: none;
  color: var(--text-dim);
}
.ex-dir {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text);
  font-size: 12px;
}
.ex-mode {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.ex-hint {
  font-size: 11.5px;
  color: var(--text-faint);
  margin-top: 6px;
}
.ex-report {
  margin-top: 10px;
  font-size: 12.5px;
  color: var(--ok);
}
.ex-err {
  color: var(--danger);
  font-size: 12px;
  margin-top: 4px;
}
</style>
