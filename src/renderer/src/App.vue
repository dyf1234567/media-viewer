<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useUiStore } from './stores/ui'
import { useLibraryStore } from './stores/library'
import { useSettingsStore } from './stores/settings'
import { setupUiPersistence } from './stores/ui'
import { importDroppedFiles } from './composables/importFlow'
import TitleBar from './components/TitleBar.vue'
import Sidebar from './components/Sidebar.vue'
import Toolbar from './components/Toolbar.vue'
import FilterBar from './components/FilterBar.vue'
import AssetGrid from './components/AssetGrid.vue'
import BatchBar from './components/BatchBar.vue'
import StatusBar from './components/StatusBar.vue'
import DetailsPanel from './components/DetailsPanel.vue'
import Previewer from './components/Previewer.vue'
import Editor from './components/Editor.vue'
import CompareWorkbench from './components/CompareWorkbench.vue'
import TagsPage from './components/TagsPage.vue'
import ImportDialogs from './components/ImportDialogs.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import AppearanceDialog from './components/AppearanceDialog.vue'
import ShortcutHelp from './components/ShortcutHelp.vue'
import CompareTray from './components/CompareTray.vue'
import SimilarDialog from './components/SimilarDialog.vue'
import Toasts from './components/Toasts.vue'
import Icon from './components/Icon.vue'

const ui = useUiStore()
const lib = useLibraryStore()
const settings = useSettingsStore()

setupUiPersistence()

const dragOver = ref(false)
let dragDepth = 0

onMounted(async () => {
  await Promise.all([lib.load(), settings.load()])
  // ? / F1 打开快捷键速查(输入框聚焦或已有对话框时不抢)
  window.addEventListener('keydown', (e) => {
    if (e.key !== '?' && e.key !== 'F1') return
    const t = e.target as HTMLElement
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
    if (document.querySelector('.dlg-mask')) return
    e.preventDefault()
    ui.shortcutHelpOpen = true
  })
  // 窗口宽度不足时自动进入紧凑布局,拉宽后自动还原
  const check = (): void => {
    const compact = window.innerWidth < 980
    if (compact && !ui.compact) {
      ui.compact = true
      ui.autoSidebar = !ui.sidebarCollapsed
      ui.autoPanel = !ui.panelCollapsed
      ui.sidebarCollapsed = true
      ui.panelCollapsed = true
    } else if (!compact && ui.compact) {
      ui.compact = false
      ui.sidebarCollapsed = !ui.autoSidebar ? ui.sidebarCollapsed : false
      ui.panelCollapsed = !ui.autoPanel ? ui.panelCollapsed : false
      if (ui.autoSidebar) ui.sidebarCollapsed = false
      if (ui.autoPanel) ui.panelCollapsed = false
      ui.autoSidebar = false
      ui.autoPanel = false
    }
  }
  window.addEventListener('resize', check)
  check()
})

// 拖拽导入(全屏遮罩提示,松手确认)
function onDragEnter(e: DragEvent): void {
  if (!e.dataTransfer?.types.includes('Files')) return
  dragDepth++
  dragOver.value = true
}
function onDragLeave(): void {
  dragDepth = Math.max(0, dragDepth - 1)
  if (!dragDepth) dragOver.value = false
}
function onDragOver(e: DragEvent): void {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
}
function onDrop(e: DragEvent): void {
  e.preventDefault()
  dragDepth = 0
  dragOver.value = false
  const files = [...(e.dataTransfer?.files ?? [])]
  if (files.length) importDroppedFiles(files)
}
</script>

<template>
  <div
    class="app"
    @dragenter="onDragEnter"
    @dragleave="onDragLeave"
    @dragover="onDragOver"
    @drop="onDrop"
  >
    <!-- 动态背景光斑层(颜色随界面背景预设,graphite/custom 下透明隐藏) -->
    <div class="bg-orbs" aria-hidden="true">
      <div class="orb o1" />
      <div class="orb o2" />
      <div class="orb o3" />
    </div>

    <TitleBar @toggle-sidebar="ui.sidebarCollapsed = !ui.sidebarCollapsed" />

    <div class="app-body">
      <Sidebar v-if="!ui.sidebarCollapsed" />
      <main class="center">
        <template v-if="ui.page === 'library'">
          <Toolbar />
          <FilterBar />
          <AssetGrid />
          <StatusBar />
          <BatchBar />
        </template>
        <TagsPage v-else />
      </main>
      <DetailsPanel v-if="!ui.panelCollapsed" />
    </div>

    <!-- 对比托盘(浮层) -->
    <CompareTray />

    <!-- 全屏遮罩:拖拽导入提示 -->
    <div v-if="dragOver" class="drop-overlay">
      <div class="drop-card">
        <Icon name="upload" :size="34" />
        <div class="drop-title">松手以导入素材</div>
        <div class="drop-sub">默认使用「引用原文件」方式,可在确认框中更改</div>
      </div>
    </div>

    <!-- 覆盖层 -->
    <Previewer v-if="ui.preview.open" />
    <Editor v-if="ui.editor.open" />
    <CompareWorkbench v-if="ui.compareOpen" />
    <ImportDialogs />
    <SettingsDialog v-if="ui.settingsOpen" />
    <AppearanceDialog v-if="ui.appearanceOpen" />
    <ShortcutHelp v-if="ui.shortcutHelpOpen" />
    <SimilarDialog v-if="ui.similarOpen" />
    <Toasts />
  </div>
</template>

<style scoped>
.app {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
/* 光斑层为 fixed 定位,主内容需提到其上 */
.app :deep(.titlebar),
.app .app-body {
  position: relative;
  z-index: 1;
}
.app-body {
  flex: 1;
  min-height: 0;
  display: flex;
}
.center {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  position: relative;
}
.drop-overlay {
  position: fixed;
  inset: 0;
  z-index: 950;
  background: rgba(10, 12, 20, 0.72);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.drop-card {
  border: 2px dashed rgba(122, 156, 255, 0.7);
  border-radius: 20px;
  padding: 44px 64px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: #cdd9ff;
  background: rgba(79, 124, 255, 0.1);
  animation: drop-pulse 1.2s ease-in-out infinite;
}
@keyframes drop-pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.02);
  }
}
.drop-title {
  font-size: 17px;
  font-weight: 600;
}
.drop-sub {
  font-size: 12px;
  color: rgba(205, 217, 255, 0.7);
}
</style>
