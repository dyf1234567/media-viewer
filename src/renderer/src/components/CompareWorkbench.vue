<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useUiStore } from '../stores/ui'
import { useTrayStore } from '../stores/tray'
import { useLibraryStore } from '../stores/library'
import { useToastStore } from '../stores/toast'
import { thumbUrl } from '../util/format'
import Icon from './Icon.vue'
import DualImageCompare from './compare/DualImageCompare.vue'
import GridCompare from './compare/GridCompare.vue'
import DualVideoCompare from './compare/DualVideoCompare.vue'

const ui = useUiStore()
const tray = useTrayStore()
const lib = useLibraryStore()
const toast = useToastStore()

const assets = computed(() =>
  tray.ids.map((id) => lib.byId.get(id)).filter(Boolean) as NonNullable<ReturnType<typeof lib.byId.get>>[]
)

const kind = computed<'image' | 'video'>(() => tray.kinds[0] ?? 'image')
const title = computed(() => {
  if (assets.value.length === 2 && kind.value === 'image') return '双图对比'
  if (assets.value.length === 2 && kind.value === 'video') return '双视频对比'
  return '多宫格对比'
})

function close(): void {
  ui.compareOpen = false
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') close()
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="cw-overlay">
    <header class="cw-head">
      <span class="cw-title">
        <Icon name="compare" :size="15" />
        {{ title }}
        <span class="cw-count">{{ assets.length }} 个素材</span>
      </span>
      <div class="cw-tray">
        <span v-for="(a, i) in assets" :key="a.id" class="cw-chip" :title="a.fileName">
          <img v-if="a.thumbDone === 1" :src="thumbUrl(a)" alt="" />
          <span class="cc-name">{{ i + 1 }}. {{ a.fileName }}</span>
          <button class="cc-x" title="移出" @click="tray.remove(a.id); if (assets.length < 2) close()">
            <Icon name="x" :size="11" />
          </button>
        </span>
      </div>
      <button class="cw-close" title="关闭(Esc)" @click="close">
        <Icon name="x" :size="16" />
      </button>
    </header>

    <DualImageCompare v-if="assets.length === 2 && kind === 'image'" :assets="[assets[0], assets[1]]" />
    <DualVideoCompare v-else-if="assets.length === 2 && kind === 'video'" :assets="[assets[0], assets[1]]" />
    <GridCompare v-else :assets="assets" />
  </div>
</template>

<style scoped>
.cw-overlay {
  position: fixed;
  inset: 0;
  z-index: 750;
  background: #101014;
  display: flex;
  flex-direction: column;
}
.cw-head {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-strong);
  flex: none;
}
.cw-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  flex: none;
}
.cw-title .icon {
  color: var(--accent);
}
.cw-count {
  font-size: 11.5px;
  font-weight: 400;
  color: var(--text-faint);
}
.cw-tray {
  flex: 1;
  min-width: 0;
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding: 2px 0;
}
.cw-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  background: var(--bg-glass);
  border: 1px solid var(--border);
  border-radius: 7px;
  padding: 3px 6px 3px 4px;
  flex: none;
}
.cw-chip img {
  width: 26px;
  height: 26px;
  border-radius: 4px;
  object-fit: cover;
}
.cc-name {
  font-size: 11.5px;
  color: var(--text-dim);
  white-space: nowrap;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cc-x {
  display: flex;
  padding: 2px;
  border-radius: 4px;
  color: var(--text-faint);
}
.cc-x:hover {
  color: var(--danger);
}
.cw-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  color: var(--text-dim);
  flex: none;
}
.cw-close:hover {
  background: rgba(255, 93, 93, 0.15);
  color: var(--danger);
}
</style>
