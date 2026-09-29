<script setup lang="ts">
import { computed } from 'vue'
import { useUiStore } from '../stores/ui'
import { useLibraryStore } from '../stores/library'
import { scopeFilter, applyFilters, applySort } from '../util/pipeline'
import { fmtBytes } from '../util/format'
import Icon from './Icon.vue'

const ui = useUiStore()
const lib = useLibraryStore()

const stats = computed(() => {
  const scoped = scopeFilter(lib.assets, ui.scope, ui.scopeAlbumId, ui.randomIds)
  const filtered = applyFilters(scoped, ui.filters, ui.search)
  const size = filtered.reduce((s, a) => s + a.fileSize, 0)
  return { count: filtered.length, size }
})

const scopeLabel = computed(() => {
  switch (ui.scope) {
    case 'all':
      return '全部素材'
    case 'favorites':
      return '收藏'
    case 'unclassified':
      return '未分类'
    case 'untagged':
      return '未标签'
    case 'trash':
      return '回收站'
    case 'random':
      return `随机浏览(${stats.value.count}/50)`
    case 'album': {
      const al = lib.albums.find((a) => a.id === ui.scopeAlbumId)
      return al ? `相册「${al.name}」` : '相册'
    }
    default:
      return ''
  }
})
</script>

<template>
  <div class="status-bar">
    <span class="scope-chip">
      <Icon name="layers" :size="12" />
      {{ scopeLabel }}
    </span>
    <span class="sep" />
    <span>{{ stats.count }} 项</span>
    <span class="sep" />
    <span>{{ fmtBytes(stats.size) }}</span>
    <span v-if="ui.isRandom" class="hint">· 排序已禁用</span>
    <span class="kbd-hint">
      {{
        ui.isTrash
          ? 'Ctrl+A 全选 · Delete 删除到系统回收站 · Esc 取消选择 · ? 速查'
          : 'Ctrl 多选 · Shift 连选 · Ctrl+A 全选 · Delete 移入回收站 · 空格预览 · ? 速查'
      }}
    </span>
  </div>
</template>

<style scoped>
.status-bar {
  flex: none;
  height: 30px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  border-top: 1px solid var(--border);
  font-size: 11.5px;
  color: var(--text-faint);
  background: rgba(0, 0, 0, 0.16);
}
.scope-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--text-dim);
}
.sep {
  width: 1px;
  height: 12px;
  background: var(--border-strong);
}
.hint {
  color: var(--text-faint);
}
.kbd-hint {
  margin-left: auto;
  color: var(--text-faint);
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
@media (max-width: 880px) {
  .kbd-hint {
    display: none;
  }
}
</style>
