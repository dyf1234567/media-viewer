?<script setup lang="ts">
import { computed } from 'vue'
import { useUiStore } from '../stores/ui'
import { useLibraryStore } from '../stores/library'
import { useTrayStore } from '../stores/tray'
import { thumbUrl } from '../util/format'
import { startImportConfirm } from '../composables/importFlow'
import Icon from './Icon.vue'

const ui = useUiStore()
const lib = useLibraryStore()
const tray = useTrayStore()

interface NavItem {
  key: string
  icon: string
  label: string
  scope: 'all' | 'favorites' | 'unclassified' | 'untagged' | 'trash'
  badge: number
  accent?: boolean
}

const navItems = computed<NavItem[]>(() => [
  { key: 'all', icon: 'home', label: '全部素材', scope: 'all', badge: lib.allCount },
  { key: 'fav', icon: 'heart', label: '收藏', scope: 'favorites', badge: lib.favoritesCount },
  { key: 'unclass', icon: 'folder', label: '未分类', scope: 'unclassified', badge: lib.unclassifiedCount },
  { key: 'untag', icon: 'tag', label: '未标签', scope: 'untagged', badge: lib.untaggedCount },
  { key: 'trash', icon: 'trash', label: '回收站', scope: 'trash', badge: lib.trashCount }
])

const albums = computed(() => lib.albums.filter((a) => a.count > 0 || a.sourcePath))

async function addDirectory(): Promise<void> {
  const dirs = await window.mv.dialog.pickDirs()
  if (!dirs.length) return
  startImportConfirm(
    dirs.map((d) => ({ path: d, isDir: true })),
    'reference'
  )
}

function albumThumb(cover: string | null): string | null {
  return cover ? `mvfile://f/${encodeURIComponent(cover)}` : null
}
</script>

<template>
  <nav class="sidebar" :class="{ collapsed: ui.sidebarCollapsed }">
    <div class="nav-list">
      <button
        v-for="item in navItems"
        :key="item.key"
        class="nav-item"
        :class="{ active: ui.scope === item.scope && ui.page === 'library' }"
        :title="ui.sidebarCollapsed ? item.label : undefined"
        @click="ui.page = 'library'; ui.setScope(item.scope)"
      >
        <Icon :name="item.icon" :size="15" />
        <span v-if="!ui.sidebarCollapsed" class="nav-label">{{ item.label }}</span>
        <span v-if="item.badge > 0" class="badge-count" :class="{ accent: ui.scope === item.scope }">
          {{ item.badge > 999 ? '999+' : item.badge }}
        </span>
      </button>
    </div>

    <div class="album-section">
      <div v-if="!ui.sidebarCollapsed" class="section-head">
        <span>相册</span>
        <button class="mini-btn" title="添加目录(递归扫描入库)" @click="addDirectory">
          <Icon name="folder-plus" :size="13" />
        </button>
      </div>
      <button
        v-else
        class="nav-item"
        title="添加目录(递归扫描入库)"
        @click="addDirectory"
      >
        <Icon name="folder-plus" :size="15" />
      </button>
      <div v-if="!ui.sidebarCollapsed" class="album-list">
        <button
          v-for="al in albums"
          :key="al.id"
          class="album-item"
          :class="{ active: ui.scope === 'album' && ui.scopeAlbumId === al.id }"
          @click="ui.page = 'library'; ui.setScope('album', al.id)"
        >
          <span class="album-cover">
            <img v-if="albumThumb(al.coverThumbPath)" :src="albumThumb(al.coverThumbPath)!" alt="" />
            <Icon v-else name="folder" :size="13" />
          </span>
          <span class="album-name">{{ al.name }}</span>
          <span class="badge-count">{{ al.count }}</span>
        </button>
        <div v-if="!albums.length" class="album-empty">通过「添加目录」创建相册</div>
      </div>
    </div>

    <div class="sidebar-foot">
      <button
        class="nav-item"
        :class="{ active: ui.page === 'tags' }"
        title="标签总览"
        @click="ui.page = ui.page === 'tags' ? 'library' : 'tags'"
      >
        <Icon name="tag" :size="15" />
        <span v-if="!ui.sidebarCollapsed" class="nav-label">标签</span>
        <span v-if="!ui.sidebarCollapsed && lib.tags.length" class="badge-count">{{ lib.tags.length }}</span>
      </button>
      <button class="nav-item" title="外观与背景" @click="ui.appearanceOpen = true">
        <Icon name="palette" :size="15" />
        <span v-if="!ui.sidebarCollapsed" class="nav-label">外观与背景</span>
      </button>
      <button class="nav-item" title="图库设置" @click="ui.settingsOpen = true">
        <Icon name="settings" :size="15" />
        <span v-if="!ui.sidebarCollapsed" class="nav-label">图库设置</span>
      </button>
    </div>

    <div v-if="!ui.sidebarCollapsed && tray.count > 0" class="tray-hint">
      <Icon name="compare" :size="13" />
      对比托盘 {{ tray.count }}/9
    </div>
  </nav>
</template>

<style scoped>
.sidebar {
  width: var(--sidebar-w);
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border);
  background: rgba(20, 21, 27, 0.88);
  overflow: hidden;
  transition: width 0.2s ease;
  flex: none;
}
.sidebar.collapsed {
  width: var(--sidebar-w-collapsed);
}
.nav-list {
  padding: 10px 8px 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 11px;
  border-radius: 8px;
  color: var(--text-dim);
  cursor: pointer;
  flex: none;
  justify-content: flex-start;
}
.sidebar.collapsed .nav-item {
  justify-content: center;
  padding: 9px 0;
}
.nav-item:hover {
  background: var(--bg-glass);
  color: var(--text);
}
.nav-item.active {
  background: var(--accent-soft);
  color: var(--accent);
}
.nav-label {
  flex: 1;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.album-section {
  flex: 1;
  overflow: hidden auto;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  min-height: 60px;
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  font-size: 11px;
  color: var(--text-faint);
  letter-spacing: 0.05em;
}
.mini-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  color: var(--text-dim);
}
.mini-btn:hover {
  background: var(--bg-glass-strong);
  color: var(--text);
}
.album-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.album-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 6px 8px;
  border-radius: 8px;
  color: var(--text-dim);
  cursor: pointer;
}
.album-item:hover {
  background: var(--bg-glass);
  color: var(--text);
}
.album-item.active {
  background: var(--accent-soft);
  color: var(--accent);
}
.album-cover {
  width: 30px;
  height: 30px;
  border-radius: 7px;
  overflow: hidden;
  background: var(--bg-glass-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-faint);
  flex: none;
}
.album-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.album-name {
  flex: 1;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12.5px;
}
.album-empty {
  padding: 10px;
  font-size: 11px;
  color: var(--text-faint);
  line-height: 1.6;
}
.sidebar-foot {
  border-top: 1px solid var(--border);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.tray-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  font-size: 11.5px;
  color: var(--text-faint);
  border-top: 1px dashed var(--border);
}
</style>
