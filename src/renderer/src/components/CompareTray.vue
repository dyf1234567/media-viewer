?<script setup lang="ts">
import { computed, ref } from 'vue'
import { useUiStore } from '../stores/ui'
import { useLibraryStore } from '../stores/library'
import { useTrayStore, TRAY_MAX } from '../stores/tray'
import { useToastStore } from '../stores/toast'
import { thumbUrl } from '../util/format'
import Icon from './Icon.vue'

const ui = useUiStore()
const lib = useLibraryStore()
const tray = useTrayStore()
const toast = useToastStore()
const expanded = ref(false)

const trayAssets = computed(() =>
  tray.ids.map((id) => lib.byId.get(id)).filter(Boolean) as NonNullable<ReturnType<typeof lib.byId.get>>[]
)

function openCompare(): void {
  if (!tray.canOpen) {
    toast.error(tray.blockedReason || '凑齐 2–9 个同类型素材后可打开对比')
    return
  }
  ui.compareOpen = true
}
</script>

<template>
  <div class="tray" :class="{ expanded }">
    <button class="tray-pill" :class="{ warn: tray.mixed }" @click="expanded = !expanded">
      <Icon name="compare" :size="14" />
      对比托盘 {{ tray.count }}/{{ TRAY_MAX }}
      <Icon :name="expanded ? 'chevron-down' : 'chevron-right'" :size="12" />
    </button>

    <div v-if="expanded" class="tray-panel">
      <div class="tray-list">
        <div v-for="a in trayAssets" :key="a.id" class="tray-item">
          <img v-if="a.thumbDone === 1" :src="thumbUrl(a)" alt="" />
          <Icon v-else :name="a.kind === 'video' ? 'video' : 'image'" :size="16" />
          <span class="t-name" :title="a.fileName">{{ a.fileName }}</span>
          <button class="t-remove" title="移出" @click="tray.remove(a.id)">
            <Icon name="x" :size="12" />
          </button>
        </div>
        <div v-if="!trayAssets.length" class="tray-empty">右键素材「加入对比」攒入</div>
      </div>
      <div v-if="tray.mixed" class="tray-warn">
        <Icon name="warning" :size="12" />
        图片与视频不能混选对比
      </div>
      <div class="tray-actions">
        <button class="btn sm" :disabled="!tray.count" @click="tray.clear()">全部清空</button>
        <button class="btn sm primary" :disabled="tray.count < 2" @click="openCompare">打开对比</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tray {
  position: fixed;
  right: 16px;
  bottom: 42px;
  z-index: 200;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}
.tray-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  background: var(--panel);
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 12.5px;
  box-shadow: var(--shadow-pop);
}
.tray-pill:hover {
  background: var(--panel-2);
}
.tray-pill.warn {
  border-color: rgba(255, 180, 77, 0.5);
  color: var(--warn);
}
.tray-panel {
  width: 280px;
  background: var(--panel-2);
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  box-shadow: var(--shadow-pop);
  padding: 8px;
}
.tray-list {
  max-height: 260px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.tray-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 6px;
  border-radius: 8px;
  font-size: 12px;
  color: var(--text-dim);
}
.tray-item:hover {
  background: var(--bg-glass-strong);
}
.tray-item img {
  width: 30px;
  height: 30px;
  object-fit: cover;
  border-radius: 5px;
  flex: none;
}
.t-name {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.t-remove {
  display: flex;
  padding: 3px;
  border-radius: 5px;
  color: var(--text-faint);
}
.t-remove:hover {
  color: var(--danger);
  background: rgba(255, 93, 93, 0.12);
}
.tray-empty {
  padding: 14px 10px;
  font-size: 12px;
  color: var(--text-faint);
  text-align: center;
}
.tray-warn {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--warn);
  font-size: 11.5px;
  padding: 6px 8px 2px;
}
.tray-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 8px;
}
</style>
