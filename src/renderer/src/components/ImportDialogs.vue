<script setup lang="ts">
import { computed } from 'vue'
import { importFlow, confirmImport, cancelImportFlow, closeImportFlow } from '../composables/importFlow'
import Icon from './Icon.vue'

const fileCount = computed(() => importFlow.entries.filter((e) => !e.isDir).length)
const dirCount = computed(() => importFlow.entries.filter((e) => e.isDir).length)
const busy = computed(() => importFlow.stage === 'running')

function escClose(): void {
  if (!busy.value) closeImportFlow()
}

function cancelRunning(): void {
  void window.mv.importer.cancel()
}

const pct = computed(() =>
  importFlow.progress.total ? Math.round((importFlow.progress.done / importFlow.progress.total) * 100) : 0
)
</script>

<template>
  <!-- 确认:选择导入方式 -->
  <div v-if="importFlow.stage === 'confirm'" class="dlg-mask" @keydown.esc.stop="escClose" @mousedown.self="escClose">
    <div class="dlg" role="dialog" aria-modal="true" aria-label="确认导入">
      <div class="dlg-head">确认导入</div>
      <div class="dlg-body">
        <p>
          即将导入
          <template v-if="fileCount">{{ fileCount }} 个文件</template>
          <template v-if="fileCount && dirCount"> 与 </template>
          <template v-if="dirCount">{{ dirCount }} 个目录(递归扫描)</template>
        </p>
        <div class="mode-choice">
          <label class="mode-item" :class="{ active: importFlow.mode === 'reference' }">
            <input v-model="importFlow.mode" type="radio" value="reference" />
            <div>
              <b>引用原文件</b>
              <span>只登记文件位置,不复制、不改动原文件</span>
            </div>
          </label>
          <label class="mode-item" :class="{ active: importFlow.mode === 'managed' }">
            <input v-model="importFlow.mode" type="radio" value="managed" />
            <div>
              <b>存进库</b>
              <span>复制一份纳入图库统一管理,原文件保留不动</span>
            </div>
          </label>
        </div>
        <p class="hint-line">重复导入同一文件时按内容自动去重,不会产生副本。</p>
      </div>
      <div class="dlg-foot">
        <button data-cancel class="btn" @click="cancelImportFlow">取消</button>
        <button class="btn primary" @click="confirmImport(importFlow.mode)">
          开始导入
        </button>
      </div>
    </div>
  </div>

  <!-- 进度 -->
  <div v-else-if="importFlow.stage === 'running'" class="dlg-mask">
    <div class="dlg" style="min-width: 420px" role="dialog" aria-modal="true" aria-label="正在导入" aria-busy="true">
      <div class="dlg-head">正在导入</div>
      <div class="dlg-body">
        <div class="prog-row">
          <div class="prog-bar">
            <div class="prog-fill" :style="{ width: pct + '%' }" />
          </div>
          <span class="prog-text">{{ importFlow.progress.done }} / {{ importFlow.progress.total }}</span>
        </div>
        <p class="prog-label" :title="importFlow.progress.label">{{ importFlow.progress.label }}</p>
        <div class="dlg-foot" style="padding: 12px 0 0">
          <button class="btn" @click="cancelRunning">取消导入</button>
        </div>
      </div>
    </div>
  </div>

  <!-- 报告 -->
  <div v-else-if="importFlow.stage === 'report' && importFlow.report" class="dlg-mask" @keydown.esc.stop="closeImportFlow" @mousedown.self="closeImportFlow">
    <div class="dlg" role="dialog" aria-modal="true" aria-label="导入完成">
      <div class="dlg-head">
        导入完成
        <span v-if="importFlow.report.cancelled" class="cancel-chip">已取消</span>
      </div>
      <div class="dlg-body">
        <div class="report-grid">
          <div class="r-item ok"><b>{{ importFlow.report.imported }}</b><span>入库</span></div>
          <div class="r-item"><b>{{ importFlow.report.reused }}</b><span>复用</span></div>
          <div class="r-item warn"><b>{{ importFlow.report.skipped.length }}</b><span>跳过</span></div>
          <div class="r-item err"><b>{{ importFlow.report.failed.length }}</b><span>失败</span></div>
        </div>
        <div v-if="importFlow.report.albumsCreated.length" class="albums-created">
          <Icon name="folder-plus" :size="13" />
          已创建相册: {{ importFlow.report.albumsCreated.join('、') }}
        </div>
        <details v-if="importFlow.report.skipped.length" class="report-detail">
          <summary>跳过的文件 ({{ importFlow.report.skipped.length }})</summary>
          <div v-for="(s, i) in importFlow.report.skipped" :key="i" class="report-line">
            <span class="f">{{ s.file }}</span>
            <span class="r">{{ s.reason }}</span>
          </div>
        </details>
        <details v-if="importFlow.report.failed.length" class="report-detail">
          <summary>失败的文件 ({{ importFlow.report.failed.length }})</summary>
          <div v-for="(f, i) in importFlow.report.failed" :key="i" class="report-line">
            <span class="f">{{ f.file }}</span>
            <span class="r">{{ f.reason }}</span>
          </div>
        </details>
      </div>
      <div class="dlg-foot">
        <button class="btn primary" @click="closeImportFlow">关闭</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mode-choice {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 12px 0;
}
.mode-item {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 12px;
  border-radius: 9px;
  border: 1px solid var(--border);
  cursor: pointer;
}
.mode-item.active {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.mode-item b {
  display: block;
  font-size: 13px;
  margin-bottom: 2px;
}
.mode-item span {
  font-size: 11.5px;
  color: var(--text-faint);
}
.hint-line {
  font-size: 11.5px;
  color: var(--text-faint);
}
.prog-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.prog-bar {
  flex: 1;
  height: 7px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
}
.prog-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 4px;
  transition: width 0.2s;
}
.prog-text {
  font-size: 12.5px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
}
.prog-label {
  margin-top: 8px;
  font-size: 11.5px;
  color: var(--text-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cancel-chip {
  font-size: 10.5px;
  font-weight: 400;
  color: var(--warn);
  background: rgba(255, 180, 77, 0.12);
  padding: 2px 8px;
  border-radius: 999px;
}
.report-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 12px;
}
.r-item {
  background: var(--bg-glass);
  border-radius: 9px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}
.r-item b {
  font-size: 19px;
  font-weight: 600;
}
.r-item span {
  font-size: 11px;
  color: var(--text-faint);
}
.r-item.ok b {
  color: var(--ok);
}
.r-item.warn b {
  color: var(--warn);
}
.r-item.err b {
  color: var(--danger);
}
.albums-created {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-dim);
  margin-bottom: 10px;
}
.report-detail {
  margin-top: 8px;
  font-size: 12px;
}
.report-detail summary {
  cursor: pointer;
  color: var(--text-dim);
  padding: 4px 0;
  user-select: none;
}
.report-line {
  display: flex;
  gap: 10px;
  padding: 4px 6px;
  border-radius: 6px;
}
.report-line:hover {
  background: var(--bg-glass);
}
.report-line .f {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-dim);
  user-select: text;
}
.report-line .r {
  flex: none;
  color: var(--danger);
  font-size: 11.5px;
}
</style>
