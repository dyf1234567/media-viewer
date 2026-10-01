<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AiMeta } from '@sh/types'
import Icon from '../Icon.vue'

const props = defineProps<{ meta: AiMeta }>()

const collapsed = ref(true)

/** 多候选提示词:复用工作流的 ShowText 缓存可能串图,可切换比对画面 */
const candIdx = ref(0)
const candidates = computed(() => props.meta.promptCandidates ?? [])
const shownPrompt = computed(() => (candIdx.value > 0 ? candidates.value[candIdx.value - 1] : props.meta.prompt))

const sourceLabel = computed(
  () =>
    ({
      a1111: 'A1111 / Forge',
      comfyui: 'ComfyUI',
      other: '其他工具'
    })[props.meta.source] ?? props.meta.source
)

const paramEntries = computed(() => Object.entries(props.meta.params ?? {}))

async function copy(text: string | null): Promise<void> {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    /* 剪贴板不可用时忽略 */
  }
}
</script>

<template>
  <div class="ai-box">
    <div class="ai-head">
      <Icon name="sparkle" :size="13" />
      <span>生成参数</span>
      <span class="src-chip">{{ sourceLabel }}</span>
    </div>

    <!-- 提示词(多候选可切换) -->
    <div v-if="shownPrompt" class="prompt-card">
      <div class="pc-head">
        <span>提示词</span>
        <button class="mini-btn" title="复制" @click="copy(shownPrompt)">
          <Icon name="copy" :size="12" />
        </button>
      </div>
      <div v-if="candidates.length" class="cand-row">
        <button class="cand-tab" :class="{ on: candIdx === 0 }" @click="candIdx = 0">主</button>
        <button
          v-for="(c, i) in candidates"
          :key="i"
          class="cand-tab"
          :class="{ on: candIdx === i + 1 }"
          :title="c.slice(0, 80)"
          @click="candIdx = i + 1"
        >
          候选{{ i + 1 }}
        </button>
      </div>
      <p class="prompt-text" :class="{ clamp: collapsed }">{{ shownPrompt }}</p>
      <button v-if="shownPrompt.length > 160 || shownPrompt.split('\n').length > 3" class="expand-btn" @click="collapsed = !collapsed">
        {{ collapsed ? '展开' : '收起' }}
      </button>
    </div>

    <!-- 负面提示词 -->
    <div v-if="meta.negative" class="prompt-card neg">
      <div class="pc-head">
        <span>负面提示词</span>
        <button class="mini-btn" title="复制" @click="copy(meta.negative)">
          <Icon name="copy" :size="12" />
        </button>
      </div>
      <p class="prompt-text clamp">{{ meta.negative }}</p>
    </div>

    <!-- 模型标签 -->
    <div v-if="meta.models?.length" class="model-tags">
      <span v-for="m in meta.models" :key="m" class="model-tag" :title="m">
        <Icon name="layers" :size="10" />
        {{ m }}
      </span>
    </div>

    <!-- 基本信息(参数键值) -->
    <div v-if="paramEntries.length" class="kv-grid">
      <div v-for="[k, v] in paramEntries" :key="k" class="kv">
        <span class="k">{{ k }}</span>
        <span class="v" :title="v">{{ v }}</span>
      </div>
    </div>

    <!-- Workflow -->
    <details v-if="meta.workflow" class="wf-block">
      <summary>Workflow 内容</summary>
      <div class="wf-actions">
        <button class="mini-btn" @click="copy(meta.workflow)">
          <Icon name="copy" :size="12" /> 复制
        </button>
      </div>
      <pre class="wf-pre">{{ meta.workflow.slice(0, 4000) }}{{ meta.workflow.length > 4000 ? '\n…' : '' }}</pre>
    </details>

    <!-- 原始参数 -->
    <details v-if="meta.raw" class="wf-block">
      <summary>原始参数</summary>
      <pre class="wf-pre">{{ meta.raw.slice(0, 4000) }}{{ meta.raw.length > 4000 ? '\n…' : '' }}</pre>
    </details>
  </div>
</template>

<style scoped>
.ai-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ai-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-dim);
}
.ai-head .icon {
  color: var(--accent);
}
.src-chip {
  margin-left: auto;
  font-size: 10px;
  font-weight: 400;
  background: var(--bg-glass);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 2px 6px;
  color: var(--text-faint);
}
.prompt-card {
  background: rgba(79, 124, 255, 0.07);
  border: 1px solid rgba(79, 124, 255, 0.18);
  border-radius: 9px;
  padding: 8px 10px;
}
.prompt-card.neg {
  background: rgba(255, 93, 93, 0.06);
  border-color: rgba(255, 93, 93, 0.16);
}
.pc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-faint);
  margin-bottom: 5px;
}
/* 候选切换标签 */
.cand-row {
  display: flex;
  gap: 4px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}
.cand-tab {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10.5px;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-faint);
  cursor: pointer;
}
.cand-tab:hover {
  color: var(--text);
}
.cand-tab.on {
  background: var(--accent-soft);
  border-color: rgba(79, 124, 255, 0.4);
  color: var(--accent);
}
.prompt-text {
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-word;
  user-select: text;
}
.prompt-text.clamp {
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.expand-btn {
  margin-top: 5px;
  font-size: 11px;
  color: var(--accent);
}
.mini-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  padding: 3px 6px;
  border-radius: 5px;
  color: var(--text-dim);
}
.mini-btn:hover {
  background: var(--bg-glass-strong);
}
.model-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.model-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  font-size: 10.5px;
  background: var(--bg-glass);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 3px 9px;
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.kv-grid {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.kv {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 11.5px;
  padding: 4px 7px;
  border-radius: 6px;
  background: var(--bg-glass);
}
.k {
  color: var(--text-faint);
  flex: none;
}
.v {
  color: var(--text);
  text-align: right;
  word-break: break-all;
  user-select: text;
}
.wf-block summary {
  font-size: 11.5px;
  color: var(--text-dim);
  cursor: pointer;
  padding: 4px 0;
  user-select: none;
}
.wf-actions {
  display: flex;
  justify-content: flex-end;
  margin: 4px 0;
}
.wf-pre {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  padding: 8px;
  font-size: 10.5px;
  line-height: 1.5;
  max-height: 220px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
  user-select: text;
  color: var(--text-dim);
}
</style>
