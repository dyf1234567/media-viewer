<script setup lang="ts">
import { computed, ref } from 'vue'
import { useUiStore } from '../stores/ui'
import { useLibraryStore } from '../stores/library'
import { useToastStore } from '../stores/toast'
import Icon from './Icon.vue'

const ui = useUiStore()
const lib = useLibraryStore()
const toast = useToastStore()

const search = ref('')
const newName = ref('')
const error = ref('')
const busy = ref(false)

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return lib.tags.filter((t) => !q || t.name.toLowerCase().includes(q))
})

async function create(): Promise<void> {
  const name = newName.value.trim()
  error.value = ''
  if (!name) {
    error.value = '标签名不能为空'
    return
  }
  if (name.length > 100) {
    error.value = '标签最长 100 个字符'
    return
  }
  if (lib.tags.some((t) => t.name === name)) {
    error.value = '已存在同名标签'
    return
  }
  busy.value = true
  try {
    await window.mv.tags.create(name)
    newName.value = ''
    void lib.refreshCollections()
    toast.success('标签已创建')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

/** 点击标签:清空搜索与筛选,跳到全部素材并按该标签过滤 */
function jumpToTag(id: number): void {
  ui.clearFilters()
  ui.page = 'library'
  ui.setScope('all')
  ui.filters.tags = [id]
}
</script>

<template>
  <div class="tags-page">
    <div class="tags-head">
      <div class="tags-stat">
        <Icon name="tag" :size="15" />
        标签总数 <b>{{ lib.tags.length }}</b>
      </div>
      <div class="tags-search">
        <Icon name="search" :size="13" />
        <input v-model="search" type="text" placeholder="搜索标签…" spellcheck="false" />
      </div>
      <div class="tags-new">
        <input
          v-model="newName"
          type="text"
          placeholder="新标签名称…"
          spellcheck="false"
          maxlength="120"
          @keydown.enter="create"
        />
        <button class="btn primary" :disabled="busy" @click="create">新建标签</button>
      </div>
    </div>
    <div v-if="error" class="inline-error">{{ error }}</div>

    <div class="tags-grid">
      <button v-for="t in filtered" :key="t.id" class="tag-card" @click="jumpToTag(t.id)">
        <Icon name="tag" :size="15" />
        <span class="tc-name" :title="t.name">{{ t.name }}</span>
        <span class="tc-count">{{ t.usage }}</span>
      </button>
      <div v-if="!filtered.length" class="empty-state">
        <div class="art"><Icon name="tag" :size="40" /></div>
        <h3>{{ lib.tags.length ? '没有匹配的标签' : '还没有标签' }}</h3>
        <p>{{ lib.tags.length ? '换个关键词试试' : '在详情面板或批量整理中即可创建标签' }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tags-page {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.tags-head {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.tags-stat {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--text-dim);
  font-size: 13px;
}
.tags-stat b {
  color: var(--text);
  font-size: 15px;
}
.tags-search {
  display: flex;
  align-items: center;
  gap: 7px;
  background: var(--bg-glass);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0 10px;
  color: var(--text-faint);
}
.tags-search input {
  border: 0;
  background: none;
  padding: 7px 0;
  width: 160px;
  outline: none;
}
.tags-new {
  display: flex;
  gap: 8px;
  margin-left: auto;
}
.tags-new input {
  width: 180px;
}
.tags-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
  align-content: start;
}
.tag-card {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 11px 13px;
  border-radius: var(--radius);
  background: var(--panel);
  border: 1px solid var(--border);
  color: var(--text-dim);
  text-align: left;
}
.tag-card:hover {
  border-color: var(--accent);
  color: var(--text);
}
.tc-name {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
}
.tc-count {
  font-size: 11px;
  background: var(--bg-glass-strong);
  border-radius: 999px;
  padding: 2px 8px;
}
</style>
