<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useUiStore } from '../stores/ui'
import { useLibraryStore } from '../stores/library'
import { useToastStore } from '../stores/toast'
import { useTrayStore } from '../stores/tray'
import { thumbUrl } from '../util/format'
import Icon from './Icon.vue'

interface Pair {
  aId: number
  bId: number
  aName: string
  bName: string
  dist: number
}

const ui = useUiStore()
const lib = useLibraryStore()
const toast = useToastStore()
const tray = useTrayStore()

const state = reactive({ threshold: 10, loading: false, searched: false })
const pairs = ref<Pair[]>([])

async function search(): Promise<void> {
  state.loading = true
  try {
    pairs.value = await window.mv.assets.findSimilar(state.threshold)
    state.searched = true
  } catch (e) {
    toast.error((e as Error).message)
  } finally {
    state.loading = false
  }
}

function thumbOf(id: number): string {
  const a = lib.byId.get(id)
  return a && a.thumbDone === 1 ? thumbUrl(a) : ''
}

function addToCompare(p: Pair): void {
  const r = tray.add([p.aId, p.bId])
  if (r.ok) toast.success('已加入对比托盘')
  else if (r.msg) toast.error(r.msg)
}

function close(): void {
  ui.similarOpen = false
}
</script>

<template>
  <Teleport to="body">
    <div class="dlg-mask" @keydown.esc.stop="close" @mousedown.self="close">
      <div class="dlg similar-dlg" role="dialog" aria-modal="true" aria-label="查找相似图片">
        <div class="dlg-head">查找相似图片</div>
        <div class="dlg-body">
          <p class="hint-line">
            按感知指纹(pHash)比对全库图片:压缩、缩放、轻微改动后的近似图也能找到,与内容去重(完全相同)互补。
          </p>
          <div class="sim-ctrl">
            <label for="sim-th">相似阈值:{{ state.threshold }}</label>
            <input id="sim-th" v-model.number="state.threshold" type="range" min="4" max="16" step="1" />
            <button class="btn primary" :disabled="state.loading" @click="search">
              {{ state.loading ? '查找中…' : pairs.length ? '重新查找' : '开始查找' }}
            </button>
          </div>

          <div v-if="pairs.length" class="sim-list">
            <div v-for="(p, i) in pairs" :key="i" class="sim-row">
              <div class="sim-side">
                <img v-if="thumbOf(p.aId)" :src="thumbOf(p.aId)" class="sim-thumb" alt="" />
                <div v-else class="sim-thumb sim-none" />
                <span class="sim-name" :title="p.aName">{{ p.aName }}</span>
              </div>
              <div class="sim-mid">
                <span class="sim-dist" :title="`汉明距离 ${p.dist} / 64,越小越像`">距离 {{ p.dist }}</span>
                <button class="btn sm" @click="addToCompare(p)">加入对比</button>
              </div>
              <div class="sim-side">
                <img v-if="thumbOf(p.bId)" :src="thumbOf(p.bId)" class="sim-thumb" alt="" />
                <div v-else class="sim-thumb sim-none" />
                <span class="sim-name" :title="p.bName">{{ p.bName }}</span>
              </div>
            </div>
          </div>
          <div v-else-if="state.searched && !state.loading" class="sim-empty">没有找到相似图片(当前阈值 {{ state.threshold }})</div>
          <div v-else-if="!state.searched" class="sim-empty">点击「开始查找」扫描全库</div>
        </div>
        <div class="dlg-foot">
          <button data-cancel class="btn" @click="close">关闭</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.similar-dlg {
  min-width: 560px;
  max-width: 640px;
}
.sim-ctrl {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 10px 0 14px;
  font-size: 12.5px;
  color: var(--text-dim);
}
.sim-ctrl input[type='range'] {
  flex: 1;
}
.sim-list {
  max-height: 380px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sim-row {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 10px;
  background: var(--bg-glass);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 8px 10px;
}
.sim-side {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.sim-thumb {
  width: 44px;
  height: 44px;
  object-fit: cover;
  border-radius: 6px;
  flex: none;
  background: rgba(0, 0, 0, 0.2);
}
.sim-none {
  background: var(--bg-glass-strong);
}
.sim-name {
  font-size: 12px;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sim-mid {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.sim-dist {
  font-size: 11.5px;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}
.sim-empty {
  padding: 26px 0;
  text-align: center;
  color: var(--text-faint);
  font-size: 12.5px;
}
</style>
