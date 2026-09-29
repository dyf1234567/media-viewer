<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useUiStore } from '../stores/ui'
import { useSettingsStore } from '../stores/settings'
import { useToastStore } from '../stores/toast'
import Icon from './Icon.vue'

const ui = useUiStore()
const settings = useSettingsStore()
const toast = useToastStore()

const draft = reactive({
  retentionDays: settings.settings.retentionDays,
  thumbCacheMB: settings.settings.thumbCacheMB,
  videoCacheMB: settings.settings.videoCacheMB
})
const error = ref('')
const busy = ref(false)
const migrating = ref(false)
const migratePct = ref(0)
const migratePhase = ref('')

function close(): void {
  if (busy.value || migrating.value) return
  ui.settingsOpen = false
}

async function save(): Promise<void> {
  error.value = ''
  if (draft.retentionDays < 0 || draft.thumbCacheMB < 0 || draft.videoCacheMB < 0) {
    error.value = '数值不能为负'
    return
  }
  busy.value = true
  try {
    await settings.saveSettings({
      retentionDays: Math.round(draft.retentionDays),
      thumbCacheMB: Math.round(draft.thumbCacheMB),
      videoCacheMB: Math.round(draft.videoCacheMB)
    })
    toast.success('已保存。清理类参数将在下次启动时生效')
    ui.settingsOpen = false
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

let unbindMigrate: (() => void) | null = null

async function migrate(): Promise<void> {
  const root = await window.mv.settings.pickLibraryRoot()
  if (!root) return
  if (root === settings.libraryRoot) {
    toast.error('新位置与当前图库位置相同')
    return
  }
  migrating.value = true
  migratePct.value = 0
  unbindMigrate = window.mv.settings.onMigrateProgress((p) => {
    migratePhase.value = p.phase
    migratePct.value = p.pct
  })
  try {
    await window.mv.settings.migrateLibrary(root)
    await settings.load()
    toast.push('图库迁移完成(原库已保留)。建议重启应用以套用全部路径。', 'success')
    restartOffer.value = true
  } catch (e) {
    toast.error(`迁移失败: ${(e as Error).message}`)
  } finally {
    migrating.value = false
    unbindMigrate?.()
  }
}

const restartOffer = ref(false)

function relaunch(): void {
  void window.mv.app.relaunch()
}
</script>

<template>
  <div class="dlg-mask" @keydown.esc.stop="close" @mousedown.self="close">
    <div class="dlg" role="dialog" aria-modal="true" aria-label="图库设置">
      <div class="dlg-head">图库设置</div>
      <div class="dlg-body">
        <div class="form-row">
          <label>
            库位置
            <span class="hint">素材副本 / 缩略图 / 缓存 / 回收区所在目录</span>
          </label>
          <div class="lib-row">
            <span class="lib-path" :title="settings.libraryRoot">{{ settings.libraryRoot }}</span>
            <button class="btn sm" :disabled="migrating" @click="migrate">
              <Icon name="folder" :size="12" /> 迁移…
            </button>
          </div>
        </div>
        <p class="lib-note">迁移为复制式:原库完整保留;完成后建议重启应用。</p>
        <div v-if="migrating" class="mig-progress">
          <div class="prog-bar">
            <div class="prog-fill" :style="{ width: migratePct + '%' }" />
          </div>
          <span>{{ migratePhase }} {{ migratePct }}%</span>
        </div>
        <div v-if="restartOffer" class="restart-offer">
          <Icon name="refresh" :size="13" />
          <span>迁移完成</span>
          <button class="btn sm primary" @click="relaunch">一键重启应用</button>
        </div>

        <div class="form-row">
          <label>
            回收区保留天数
            <span class="hint">到期自动送入系统回收站;0 = 不自动清理</span>
          </label>
          <div class="num-row">
            <input v-model.number="draft.retentionDays" type="number" min="0" max="3650" />
            <span>天</span>
          </div>
        </div>
        <div class="form-row">
          <label>
            缩略图缓存上限
            <span class="hint">超限从最旧开始自动清理,下次启动生效</span>
          </label>
          <div class="num-row">
            <input v-model.number="draft.thumbCacheMB" type="number" min="50" max="10240" />
            <span>MB</span>
          </div>
        </div>
        <div class="form-row">
          <label>
            视频预览缓存上限
            <span class="hint">自动清理最久未用的转封装预览,不影响原视频</span>
          </label>
          <div class="num-row">
            <input v-model.number="draft.videoCacheMB" type="number" min="100" max="51200" />
            <span>MB</span>
          </div>
        </div>
        <div v-if="error" class="inline-error">{{ error }}</div>
      </div>
      <div class="dlg-foot">
        <button class="btn" :disabled="busy" @click="close">取消</button>
        <button class="btn primary" :disabled="busy" @click="save">
          {{ busy ? '处理中…' : '保存' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lib-row {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 320px;
}
.lib-path {
  flex: 1;
  min-width: 0;
  font-size: 11.5px;
  color: var(--text-dim);
  background: var(--bg-glass);
  border-radius: 6px;
  padding: 6px 9px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  direction: rtl;
  text-align: left;
  user-select: text;
}
.lib-note {
  font-size: 11px;
  color: var(--text-faint);
  margin: -4px 0 6px;
}
.num-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.num-row input {
  width: 90px;
  text-align: right;
}
.num-row span {
  font-size: 12px;
  color: var(--text-faint);
}
.mig-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 8px 0;
  font-size: 12px;
  color: var(--text-dim);
}
.prog-bar {
  flex: 1;
  height: 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
}
.prog-fill {
  height: 100%;
  background: var(--accent);
  transition: width 0.2s;
}
.restart-offer {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 8px 0;
  padding: 9px 12px;
  border-radius: 9px;
  background: rgba(77, 216, 130, 0.1);
  color: var(--ok);
  font-size: 12.5px;
}
</style>
