?<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import Icon from './Icon.vue'

const emit = defineEmits<{ (e: 'toggle-sidebar'): void }>()

const maximized = ref(false)
const pinned = ref(false)
let unbind: (() => void) | null = null

onMounted(async () => {
  const s = await window.mv.win.getState()
  maximized.value = s.maximized
  pinned.value = s.pinned
  unbind = window.mv.win.onState((s2) => {
    maximized.value = s2.maximized
    pinned.value = s2.pinned
  })
})
onUnmounted(() => unbind?.())

async function togglePin(): Promise<void> {
  pinned.value = await window.mv.win.pinToggle()
}
function doMin(): void {
  void window.mv.win.minimize()
}
function doMax(): void {
  void window.mv.win.maximizeToggle()
}
function doClose(): void {
  void window.mv.win.close()
}
</script>

<template>
  <header class="titlebar">
    <div class="tb-left">
      <button class="tb-btn" title="收起 / 展开侧栏" @click="emit('toggle-sidebar')">
        <Icon name="layers" :size="15" />
      </button>
      <div class="tb-title">
        <span class="tb-logo"><Icon name="image" :size="13" /></span>
        Media Viewer
      </div>
    </div>
    <div class="tb-drag" />
    <div class="tb-right">
      <button
        class="tb-btn"
        :class="{ active: pinned }"
        :title="pinned ? '取消置顶' : '窗口置顶'"
        @click="togglePin"
      >
        <Icon name="pin" :size="14" />
      </button>
      <button class="tb-btn" title="最小化" @click="doMin">
        <Icon name="minimize" :size="14" />
      </button>
      <button class="tb-btn" :title="maximized ? '还原' : '最大化'" @click="doMax">
        <Icon :name="maximized ? 'restore' : 'maximize'" :size="13" />
      </button>
      <button class="tb-btn tb-close" title="关闭" @click="doClose">
        <Icon name="close" :size="14" />
      </button>
    </div>
  </header>
</template>

<style scoped>
.titlebar {
  height: var(--titlebar-h);
  display: flex;
  align-items: stretch;
  background: var(--bg-glass);
  border-bottom: 1px solid var(--border);
  -webkit-app-region: drag;
  flex: none;
}
.tb-left,
.tb-right {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 8px;
  -webkit-app-region: no-drag;
}
.tb-drag {
  flex: 1;
}
.tb-title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-dim);
  padding: 0 6px;
  user-select: none;
}
.tb-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: var(--accent-soft);
  color: var(--accent);
}
.tb-btn {
  width: 32px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  color: var(--text-dim);
}
.tb-btn:hover {
  background: var(--bg-glass-strong);
  color: var(--text);
}
.tb-btn.active {
  color: var(--accent);
  background: var(--accent-soft);
}
.tb-close:hover {
  background: #e5484d;
  color: #fff;
}
</style>
