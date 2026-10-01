<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { AssetFull } from '@sh/types'
import { useUiStore } from '../stores/ui'
import { useLibraryStore } from '../stores/library'
import { useToastStore } from '../stores/toast'
import { scopeFilter, applyFilters, applySort } from '../util/pipeline'
import { fmtBytes, fmtDate, fmtDuration, rgbCss, thumbUrl } from '../util/format'
import Icon from './Icon.vue'
import RatingStars from './details/RatingStars.vue'
import HistogramBox from './details/HistogramBox.vue'
import AiMetaBox from './details/AiMetaBox.vue'
import TagEditor from './details/TagEditor.vue'

const ui = useUiStore()
const lib = useLibraryStore()
const toast = useToastStore()

// 懒加载的完整信息(EXIF / AI 参数 / 视频信息)
const fullCache = reactive(new Map<number, AssetFull>())
const full = computed<AssetFull | null>(() => {
  const id = ui.detailsAssetId
  if (id == null) return null
  return fullCache.get(id) ?? ((lib.byId.get(id) as AssetFull | undefined) ?? null)
})

watch(
  () => ui.detailsAssetId,
  async (id) => {
    if (id == null || fullCache.has(id)) return
    try {
      const f = await window.mv.assets.get(id)
      fullCache.set(id, f)
    } catch (e) {
      toast.error((e as Error).message)
    }
  },
  { immediate: true }
)

// 缓存快照跟随 store 同步:评分/收藏等更新走 patchLocal 或 lib:changed 换新对象,
// 不合并的话 full 停留在首次选中时的快照,界面永远不刷新
// 缓存快照跟随 store 同步:评分/收藏等更新走 patchLocal 或 lib:changed 换新对象,
// 不合并的话 full 停留在首次选中时的快照,界面永远不刷新。
// flush: sync 保证连续快速 toggle 时读到的 full 值也是最新的,不会反向
watch(
  () => (ui.detailsAssetId != null ? lib.byId.get(ui.detailsAssetId) : null),
  (base) => {
    if (!base) return
    const cached = fullCache.get(base.id)
    if (cached) Object.assign(cached, base)
  },
  { deep: true, flush: 'sync' }
)

// 未选中时的统计
const stats = computed(() => {
  const scoped = scopeFilter(lib.assets, ui.scope, ui.scopeAlbumId, ui.randomIds)
  const filtered = applyFilters(scoped, ui.filters, ui.search)
  return {
    count: filtered.length,
    size: filtered.reduce((s, a) => s + a.fileSize, 0)
  }
})

// 重命名
const renaming = ref(false)
const renameValue = ref('')

function startRename(): void {
  if (!full.value || ui.isTrash) return
  renameValue.value = full.value.fileName.replace(new RegExp(`\\.${full.value.ext}$`, 'i'), '')
  renaming.value = true
}

async function commitRename(): Promise<void> {
  if (!renaming.value || !full.value) return
  renaming.value = false
  const name = renameValue.value.trim()
  if (!name) return
  try {
    await window.mv.assets.rename(full.value.id, name)
  } catch (e) {
    toast.error((e as Error).message)
  }
}

function cancelRename(): void {
  renaming.value = false
}

// 评分 / 收藏(乐观更新,失败恢复原值并提示)
async function setRating(r: number): Promise<void> {
  if (!full.value || ui.isTrash) return
  const prev = full.value.rating
  lib.patchLocal(full.value.id, { rating: r })
  try {
    const updated = await window.mv.assets.update(full.value.id, { rating: r })
    lib.patchLocal(full.value.id, updated)
  } catch (e) {
    lib.patchLocal(full.value.id, { rating: prev })
    toast.error((e as Error).message)
  }
}

async function toggleFav(): Promise<void> {
  if (!full.value || ui.isTrash) return
  const prev = full.value.favorite
  lib.patchLocal(full.value.id, { favorite: !prev })
  try {
    const updated = await window.mv.assets.update(full.value.id, { favorite: !prev })
    lib.patchLocal(full.value.id, updated)
  } catch (e) {
    lib.patchLocal(full.value.id, { favorite: prev })
    toast.error((e as Error).message)
  }
}

// 注释
const noteEditing = ref(false)
const noteValue = ref('')
async function commitNote(): Promise<void> {
  noteEditing.value = false
  if (!full.value) return
  const v = noteValue.value
  try {
    const updated = await window.mv.assets.update(full.value.id, { note: v })
    lib.patchLocal(full.value.id, updated)
    fullCache.set(full.value.id, { ...full.value, note: v })
  } catch (e) {
    toast.error((e as Error).message)
  }
}

// 相册
const albumMenu = reactive({ open: false })

/** 复制主题色 hex */
function copyColor(css: string): void {
  void navigator.clipboard.writeText(css).catch(() => {})
}
const newAlbumName = ref('')
const assetAlbums = computed(() => {
  const a = full.value
  if (!a) return []
  return a.albumIds
    .map((id) => lib.albums.find((al) => al.id === id))
    .filter(Boolean) as { id: number; name: string; count: number }[]
})

async function assignAlbum(albumId: number): Promise<void> {
  if (!full.value) return
  try {
    await window.mv.albums.assign([full.value.id], albumId)
    albumMenu.open = false
  } catch (e) {
    toast.error((e as Error).message)
  }
}

async function unassignAlbum(albumId: number): Promise<void> {
  if (!full.value) return
  try {
    await window.mv.albums.unassign(full.value.id, albumId)
  } catch (e) {
    toast.error((e as Error).message)
  }
}

async function createAlbum(): Promise<void> {
  const name = newAlbumName.value.trim()
  if (!name || !full.value) return
  try {
    const al = await window.mv.albums.create(name)
    newAlbumName.value = ''
    await assignAlbum(al.id)
  } catch (e) {
    toast.error((e as Error).message)
  }
}

// 删除(带确认)?
const confirmDel = ref(false)
async function doDelete(): Promise<void> {
  if (!full.value) return
  confirmDel.value = false
  const results = await window.mv.assets.toTrash([full.value.id])
  if (results[0] && !results[0].ok) toast.error(results[0].error ?? '移入回收站失败')
  ui.detailsAssetId = null
}

// 重新定位
async function relocate(): Promise<void> {
  if (!full.value) return
  toast.push('正在按文件内容搜索,请稍候…')
  try {
    const r = await window.mv.assets.relocate(full.value.id)
    if (r.canceled) return
    if (r.found) toast.success('已找回文件')
    else toast.error('在所选位置未找到内容一致的文件')
  } catch (e) {
    toast.error((e as Error).message)
  }
}

// EXIF 展示
const exifRows = computed(() => {
  const e = full.value?.exif
  if (!e) return []
  const rows: { k: string; v: string }[] = []
  const cam = [e.make, e.model].filter(Boolean).join(' ')
  if (cam) rows.push({ k: '机身', v: cam })
  if (e.fNumber) rows.push({ k: '光圈', v: `f/${e.fNumber}` })
  if (e.exposureTime) rows.push({ k: '快门', v: exposureText(e.exposureTime) })
  if (e.iso) rows.push({ k: 'ISO', v: String(e.iso) })
  if (e.focalLength) rows.push({ k: '焦距', v: `${e.focalLength} mm` })
  if (e.dateTimeOriginal) rows.push({ k: '拍摄时间', v: fmtDate(new Date(e.dateTimeOriginal).getTime()) })
  return rows
})

function exposureText(t: number): string {
  return t >= 1 ? `${t}s` : `1/${Math.round(1 / t)}s`
}

// 视频信息
const videoRows = computed(() => {
  const v = full.value?.videoInfo
  if (!v) return []
  return [
    { k: '分辨率', v: `${v.width}×${v.height}` },
    { k: '帧率', v: v.fps ? `${v.fps} fps` : '-' },
    { k: '时长', v: fmtDuration(v.durationMs) },
    { k: '码率', v: v.bitrate ? `${(v.bitrate / 1000).toFixed(0)} kbps` : '-' },
    { k: '编码', v: v.videoCodec.toUpperCase() },
    { k: '音轨', v: v.hasAudio ? (v.audioCodec ?? '有').toUpperCase() : '无音轨' }
  ]
})
</script>

<template>
  <aside class="details">
    <!-- 未选中:范围统计 -->
    <div v-if="!full" class="no-selection">
      <Icon name="info" :size="22" />
      <div class="ns-title">未选中素材</div>
      <div class="ns-stats">
        <div><b>{{ stats.count }}</b><span>项</span></div>
        <div><b>{{ fmtBytes(stats.size) }}</b><span>总大小</span></div>
      </div>
      <p class="ns-hint">点击素材查看详情;双击打开预览</p>
    </div>

    <template v-else>
      <!-- 预览器(用缩略图:预览器打开时避免同一张原图解码两次) -->
      <div class="preview-box">
        <img
          v-if="!full.missing"
          :src="thumbUrl(full)"
          alt=""
          @dblclick="ui.openPreview(full.id)"
        />
        <div v-else class="missing-box">
          <Icon name="warning" :size="26" />
          <span>文件缺失</span>
          <button class="btn sm" @click="relocate">
            <Icon name="relocate" :size="12" /> 重新定位
          </button>
        </div>
        <span class="format-badge">{{ full.ext.toUpperCase() }}</span>
        <span v-if="full.storageMode === 'managed'" class="mode-badge" title="已存进库统一管理">
          <Icon name="save" :size="10" /> 库内
        </span>
      </div>

      <!-- 主题色(Eagle 式色点药丸行) -->
      <div v-if="full.colors && full.colors.length" class="colors-pill">
        <span
          v-for="(c, i) in full.colors"
          :key="i"
          class="color-dot"
          :style="{ background: rgbCss(c) }"
          :title="`${rgbCss(c)} — 点击复制`"
          @click="copyColor(rgbCss(c))"
        />
      </div>

      <!-- 文件名与操作 -->
      <div class="head-area">
        <div v-if="renaming" class="rename-row">
          <input
            ref="renameInput"
            v-model="renameValue"
            type="text"
            spellcheck="false"
            @keydown.enter="commitRename"
            @keydown.esc="cancelRename"
            @blur="commitRename"
            @vue:mounted="($el as HTMLInputElement).focus()"
          />
          <span class="ext-hint">.{{ full.ext }}</span>
        </div>
        <div v-else class="name-row" :title="ui.isTrash ? full.fileName : '点击重命名,同步修改磁盘文件)'">
          <span class="file-name" @dblclick="startRename">{{ full.fileName }}</span>
          <button v-if="!ui.isTrash" class="mini-btn" title="重命名" @click="startRename">
            <Icon name="edit" :size="13" />
          </button>
        </div>

        <div class="action-row">
          <RatingStars v-if="!ui.isTrash" :model-value="full.rating" @set="setRating" />
          <span v-else class="stars-readonly">{{ full.rating ? '★'.repeat(full.rating) : '未评分' }}</span>
          <div class="spacer" />
          <button
            v-if="!ui.isTrash"
            class="icon-btn"
            :class="{ on: full.favorite }"
            title="收藏"
            @click="toggleFav"
          >
            <Icon name="heart" :size="15" :filled="full.favorite" />
          </button>
          <button
            v-if="full.kind === 'image' && !ui.isTrash && !full.missing"
            class="icon-btn"
            title="编辑图片"
            @click="ui.openEditor(full.id)"
          >
            <Icon name="edit" :size="14" />
          </button>
          <button v-if="!ui.isTrash" class="icon-btn danger" title="删除(移入回收站)" @click="confirmDel = true">
            <Icon name="trash" :size="14" />
          </button>
        </div>
      </div>

      <!-- 基本信息(可折叠) -->
      <details class="sec fold">
        <summary>基本信息<Icon name="chevron-down" :size="13" class="fold-chevron" /></summary>
        <div class="fold-body">
          <div class="kv"><span class="k">尺寸</span><span class="v">{{ full.width }} × {{ full.height }}</span></div>
          <div class="kv"><span class="k">大小</span><span class="v">{{ fmtBytes(full.fileSize) }}</span></div>
          <div v-if="full.kind === 'video' && full.durationMs" class="kv">
            <span class="k">时长</span><span class="v">{{ fmtDuration(full.durationMs) }}</span>
          </div>
          <div class="kv"><span class="k">导入时间</span><span class="v">{{ fmtDate(full.importedAt) }}</span></div>
          <div class="kv"><span class="k">修改时间</span><span class="v">{{ fmtDate(full.fileModifiedAt) }}</span></div>
          <div class="kv path-kv"><span class="k">位置</span><span class="v" :title="full.filePath">{{ full.filePath }}</span></div>
        </div>
      </details>

      <!-- 标签(TagEditor 自带标题) -->
      <div v-if="!ui.isTrash" class="sec">
        <TagEditor :asset-id="full.id" />
      </div>
      <div v-else class="sec">
        <div class="sec-title">标签</div>
        <div class="tag-list-ro">
          <span v-for="t in full.tagIds.map((id) => lib.tags.find(x => x.id === id)?.name).filter(Boolean)" :key="t" class="tag-ro">{{ t }}</span>
          <span v-if="!full.tagIds.length" class="hint-text">暂无标签</span>
        </div>
      </div>

      <!-- 文件夹 -->
      <div v-if="!ui.isTrash" class="sec">
        <div class="sec-title">文件夹</div>
        <button class="add-wide" @click="albumMenu.open = !albumMenu.open">
          <Icon name="plus" :size="14" /> 添加文件夹
        </button>
        <div v-if="assetAlbums.length" class="album-chips">
          <span v-for="al in assetAlbums" :key="al.id" class="album-chip">
            {{ al.name }}
            <button class="tag-x" title="移出相册" @click="unassignAlbum(al.id)">
              <Icon name="x" :size="10" />
            </button>
          </span>
        </div>
        <div v-if="albumMenu.open" class="album-menu">
          <div class="popover-label">加入 / 更换相册</div>
          <div class="album-scroll">
            <div v-for="al in lib.albums" :key="al.id" class="popover-item" @click="assignAlbum(al.id)">
              <Icon name="folder" :size="13" />
              {{ al.name }}
              <span class="badge-count" style="margin-left: auto">{{ al.count }}</span>
            </div>
            <div v-if="!lib.albums.length" class="popover-label">暂无相册</div>
          </div>
          <div class="new-album-row">
            <input v-model="newAlbumName" type="text" placeholder="新建相册并移入…" spellcheck="false" @keydown.enter="createAlbum" />
            <button class="btn sm" :disabled="!newAlbumName.trim()" @click="createAlbum">创建</button>
          </div>
        </div>
      </div>

      <!-- EXIF(可折叠) -->
      <details v-if="exifRows.length" class="sec fold">
        <summary>摄影参数<Icon name="chevron-down" :size="13" class="fold-chevron" /></summary>
        <div class="fold-body">
          <div v-for="row in exifRows" :key="row.k" class="kv">
            <span class="k">{{ row.k }}</span><span class="v">{{ row.v }}</span>
          </div>
        </div>
      </details>

      <!-- 视频信息(可折叠) -->
      <details v-if="videoRows.length" class="sec fold">
        <summary>视频信息<Icon name="chevron-down" :size="13" class="fold-chevron" /></summary>
        <div class="fold-body">
          <div v-for="row in videoRows" :key="row.k" class="kv">
            <span class="k">{{ row.k }}</span><span class="v">{{ row.v }}</span>
          </div>
        </div>
      </details>

      <!-- 注释(Eagle 式输入框) -->
      <div v-if="!ui.isTrash" class="sec">
        <div v-if="noteEditing">
          <textarea v-model="noteValue" rows="3" spellcheck="false" @blur="commitNote" @keydown.esc="noteEditing = false" />
          <button class="btn sm" style="margin-top: 6px" @click="commitNote">保存</button>
        </div>
        <div v-else class="note-box" :class="{ empty: !full.note }" title="点击添加注释" @click="noteValue = full.note; noteEditing = true">
          {{ full.note || '添加注释' }}
        </div>
      </div>

      <!-- 直方图(可折叠,默认展开) -->
      <details v-if="full.kind === 'image' && !full.missing && !ui.isTrash" class="sec fold" open>
        <summary>直方图<Icon name="chevron-down" :size="13" class="fold-chevron" /></summary>
        <div class="fold-body">
          <HistogramBox :asset-id="full.id" />
        </div>
      </details>

      <!-- AI 生成参数(可折叠,默认展开) -->
      <details v-if="full.aiMeta" class="sec fold" open>
        <summary>AI 生成参数<Icon name="chevron-down" :size="13" class="fold-chevron" /></summary>
        <div class="fold-body">
          <AiMetaBox :meta="full.aiMeta" />
        </div>
      </details>
    </template>

    <!-- 删除确认 -->
    <Teleport to="body">
      <div v-if="confirmDel" class="dlg-mask" @keydown.esc.stop="confirmDel = false" @mousedown.self="confirmDel = false">
        <div class="dlg" style="min-width: 380px" role="dialog" aria-modal="true" aria-label="删除素材">
          <div class="dlg-head">删除素材</div>
          <div class="dlg-body">
            <p>将「{{ full?.fileName }}」移入应用回收站,之后可在回收站中恢复。</p>
          </div>
          <div class="dlg-foot">
            <button data-cancel class="btn" @click="confirmDel = false">取消</button>
            <button class="btn danger" @click="doDelete">移入回收站</button>
          </div>
        </div>
      </div>
    </Teleport>
  </aside>
</template>

<style scoped>
.details {
  width: var(--details-w);
  flex: none;
  border-left: 1px solid var(--border);
  background: rgba(20, 21, 27, 0.92);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
/* 面板内容超出时整体滚动,而不是把每个区块压扁(压缩会导致预览图溢出被裁) */
.details > * {
  flex-shrink: 0;
}
.no-selection {
  padding: 40px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--text-faint);
  text-align: center;
}
.ns-title {
  font-size: 13px;
  color: var(--text-dim);
}
.ns-stats {
  display: flex;
  gap: 26px;
}
.ns-stats div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ns-stats b {
  font-size: 18px;
  font-weight: 600;
  color: var(--text);
}
.ns-stats span {
  font-size: 11px;
}
.ns-hint {
  font-size: 11.5px;
  line-height: 1.6;
}
.preview-box {
  position: relative;
  margin: 12px;
  border-radius: var(--radius);
  overflow: hidden;
  background: rgba(0, 0, 0, 0.32);
  /* 固定高度:预览区不随图片比例变化,下方内容不跳动;30vh 不喧宾夺主 */
  height: 30vh;
  min-height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.preview-box img {
  /* 填满固定区域,等比 contain:任何比例的图都完整可见 */
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  cursor: zoom-in;
}
.missing-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 26px 0;
  color: var(--text-faint);
  font-size: 12px;
}
.format-badge,
.mode-badge {
  position: absolute;
  top: 8px;
  background: rgba(0, 0, 0, 0.66);
  color: #fff;
  border-radius: 5px;
  font-size: 10px;
  padding: 2px 7px;
}
.format-badge {
  left: 8px;
}
.mode-badge {
  right: 8px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.head-area {
  padding: 0 14px 6px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.name-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.file-name {
  flex: 1;
  min-width: 0;
  font-size: 13.5px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: text;
}
.rename-row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.rename-row input {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
}
.ext-hint {
  color: var(--text-faint);
  font-size: 12px;
  flex: none;
}
.action-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.spacer {
  flex: 1;
}
.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  color: var(--text-dim);
}
.icon-btn:hover {
  background: var(--bg-glass-strong);
  color: var(--text);
}
.icon-btn.on {
  color: #ff6b81;
}
.icon-btn.danger:hover {
  color: var(--danger);
}
.stars-readonly {
  color: var(--star);
  font-size: 13px;
  letter-spacing: 2px;
}
.sec {
  padding: 10px 14px;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sec-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 8px;
}
.sec-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.mini-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  padding: 4px 7px;
  border-radius: 6px;
  color: var(--text-dim);
}
.mini-btn:hover {
  background: var(--bg-glass-strong);
}
.kv {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
}
.kv .k {
  color: var(--text-faint);
  flex: none;
}
.kv .v {
  color: var(--text);
  text-align: right;
  word-break: break-all;
  user-select: text;
}
.path-kv .v {
  font-size: 10.5px;
  max-width: 210px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.color-dots {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
/* Eagle 式色点药丸行 */
.colors-pill {
  display: flex;
  gap: 9px;
  align-items: center;
  margin: 0 14px 10px;
  padding: 8px 14px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.32);
  overflow: hidden;
}
.colors-pill .color-dot {
  width: 15px;
  height: 15px;
  border-radius: 50%;
  flex: none;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.22);
  transition: transform 0.12s ease;
}
.colors-pill .color-dot:hover {
  transform: scale(1.18);
}
.color-dot {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid var(--border-strong);
}
/* Eagle 式注释输入框 */
.note-box {
  padding: 9px 12px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-dim);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  cursor: text;
  user-select: text;
  min-height: 34px;
}
.note-box:hover {
  border-color: var(--border-strong);
}
.note-box.empty {
  color: var(--text-faint);
}
/* 全宽添加按钮(标签/文件夹) */
.add-wide {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 9px 0;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border);
  color: var(--text-dim);
  font-size: 12.5px;
  cursor: pointer;
}
.add-wide:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text);
}
/* 可折叠区块 */
details.fold summary {
  list-style: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  user-select: none;
}
details.fold summary::-webkit-details-marker {
  display: none;
}
.fold-chevron {
  color: var(--text-faint);
  transition: transform 0.15s ease;
}
details[open] > summary .fold-chevron {
  transform: rotate(180deg);
}
.fold-body {
  margin-top: 8px;
}
.album-chips,
.tag-list-ro {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.album-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--bg-glass-strong);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 3px 5px 3px 10px;
  font-size: 11.5px;
  color: var(--text-dim);
}
.tag-x {
  display: flex;
  padding: 2px;
  border-radius: 50%;
  color: var(--text-faint);
}
.tag-x:hover {
  color: var(--danger);
}
.tag-ro {
  background: var(--bg-glass-strong);
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 11.5px;
  color: var(--text-dim);
}
.hint-text {
  font-size: 11.5px;
  color: var(--text-faint);
}
.album-menu {
  background: var(--panel-2);
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  padding: 5px;
}
.album-scroll {
  max-height: 150px;
  overflow: auto;
}
.new-album-row {
  display: flex;
  gap: 6px;
  padding: 5px 2px 2px;
}
.new-album-row input {
  flex: 1;
  min-width: 0;
  font-size: 12px;
}
.note-text {
  font-size: 12px;
  color: var(--text-dim);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  user-select: text;
}
.note-text.empty {
  color: var(--text-faint);
  cursor: pointer;
}
textarea {
  width: 100%;
  font: inherit;
  font-size: 12px;
  color: var(--text);
  background: var(--bg-glass);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  outline: none;
  resize: vertical;
}
</style>
