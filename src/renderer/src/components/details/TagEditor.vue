<script setup lang="ts">
import { computed, ref } from 'vue'
import { useUiStore } from '../../stores/ui'
import { useLibraryStore } from '../../stores/library'
import { useToastStore } from '../../stores/toast'
import Icon from '../Icon.vue'

const props = defineProps<{ assetId: number; readonly?: boolean }>()

const ui = useUiStore()
const lib = useLibraryStore()
const toast = useToastStore()

const query = ref('')
const open = ref(false)

const asset = computed(() => lib.byId.get(props.assetId))
const assetTags = computed(() => {
  const a = asset.value
  if (!a) return []
  return a.tagIds
    .map((id) => lib.tags.find((t) => t.id === id))
    .filter(Boolean) as { id: number; name: string; usage: number }[]
})

/** 搜索 + 按使用次数推荐 */
const suggestions = computed(() => {
  const q = query.value.trim().toLowerCase()
  const existing = new Set(asset.value?.tagIds ?? [])
  return lib.tags
    .filter((t) => !existing.has(t.id))
    .filter((t) => !q || t.name.toLowerCase().includes(q))
    .sort((a, b) => b.usage - a.usage)
    .slice(0, 8)
})

const canCreate = computed(() => {
  const q = query.value.trim()
  if (!q) return false
  if (q.length > 100) return false
  return !lib.tags.some((t) => t.name === q)
})

async function addTag(name: string): Promise<void> {
  const n = name.trim()
  if (!n) return
  if (n.length > 100) {
    toast.error('标签最长 100 个字符')
    return
  }
  if (assetTags.value.some((t) => t.name === n)) return
  try {
    await window.mv.tags.assign([props.assetId], n)
    query.value = ''
    open.value = false
  } catch (e) {
    toast.error((e as Error).message)
  }
}

async function removeTag(tagId: number): Promise<void> {
  try {
    await window.mv.tags.unassign(props.assetId, tagId)
  } catch (e) {
    toast.error((e as Error).message)
  }
}
</script>

<template>
  <div class="tag-box">
    <div class="sec-title">标签</div>
    <div class="tag-list">
      <span v-for="t in assetTags" :key="t.id" class="tag">
        {{ t.name }}
        <button v-if="!readonly" class="tag-x" title="移除标签" @click="removeTag(t.id)">
          <Icon name="x" :size="10" />
        </button>
      </span>
      <span v-if="!assetTags.length" class="no-tag">暂无标签</span>
    </div>
    <div v-if="!readonly" class="tag-add">
      <input
        v-model="query"
        type="text"
        placeholder="搜索 / 新建标签…"
        spellcheck="false"
        @focus="open = true"
        @keydown.enter="addTag(query)"
      />
      <button class="btn sm" :disabled="!query.trim()" @click="addTag(query)">添加</button>
    </div>
    <div v-if="open && (suggestions.length || canCreate)" class="suggest">
      <div
        v-if="canCreate"
        class="s-item create"
        @mousedown.prevent="addTag(query)"
      >
        <Icon name="plus" :size="12" />
        创建新标签「{{ query.trim() }}」
      </div>
      <div
        v-for="s in suggestions"
        :key="s.id"
        class="s-item"
        @mousedown.prevent="addTag(s.name)"
      >
        {{ s.name }}
        <span class="badge-count">{{ s.usage }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tag-box {
  display: flex;
  flex-direction: column;
  gap: 7px;
  position: relative;
}
.sec-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-dim);
}
.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: var(--bg-glass-strong);
  border: 1px solid var(--border);
  color: var(--text-dim);
  border-radius: 999px;
  padding: 3px 5px 3px 10px;
  font-size: 11.5px;
  max-width: 100%;
}
.tag-x {
  display: flex;
  padding: 2px;
  border-radius: 50%;
  color: var(--text-faint);
}
.tag-x:hover {
  color: var(--danger);
  background: rgba(255, 93, 93, 0.14);
}
.no-tag {
  font-size: 11.5px;
  color: var(--text-faint);
}
.tag-add {
  display: flex;
  gap: 6px;
}
.tag-add input {
  flex: 1;
  min-width: 0;
  font-size: 12px;
}
.suggest {
  position: absolute;
  left: 0;
  right: 0;
  top: 100%;
  z-index: 50;
  background: #1e1f27;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  box-shadow: var(--shadow-pop);
  padding: 5px;
  max-height: 200px;
  overflow: auto;
}
.s-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 9px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  color: var(--text-dim);
}
.s-item:hover {
  background: var(--bg-glass-strong);
  color: var(--text);
}
.s-item.create {
  color: var(--accent);
}
</style>
