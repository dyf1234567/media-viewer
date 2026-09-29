import { reactive } from 'vue'
import type { ImportReport } from '@sh/types'
import { useToastStore } from '../stores/toast'

export interface ImportEntry {
  path: string
  isDir: boolean
}

/** 导入流程协调:确认(选方式)→ 进度(可取消)→ 报告 */
export const importFlow = reactive({
  stage: 'idle' as 'idle' | 'confirm' | 'running' | 'report',
  entries: [] as ImportEntry[],
  mode: 'reference' as 'reference' | 'managed',
  progress: { done: 0, total: 0, label: '' },
  report: null as ImportReport | null
})

let unbindProgress: (() => void) | null = null

export function startImportConfirm(entries: ImportEntry[], defaultMode: 'reference' | 'managed' = 'reference'): void {
  if (importFlow.stage === 'running') {
    useToastStore().error('已有导入任务正在进行')
    return
  }
  importFlow.entries = entries
  importFlow.mode = defaultMode
  importFlow.stage = 'confirm'
}

export async function confirmImport(mode: 'reference' | 'managed'): Promise<void> {
  importFlow.mode = mode
  importFlow.stage = 'running'
  importFlow.progress = { done: 0, total: 0, label: '' }
  unbindProgress?.()
  unbindProgress = window.mv.importer.onProgress((p) => {
    importFlow.progress = p
  })
  try {
    // contextBridge 会结构化克隆参数,Vue 响应式代理无法跨界,先转为普通对象
    const plainEntries = importFlow.entries.map((e) => ({ path: e.path, isDir: e.isDir }))
    importFlow.report = await window.mv.importer.run(plainEntries, mode)
    importFlow.stage = 'report'
  } catch (e) {
    importFlow.stage = 'idle'
    useToastStore().error(`导入失败: ${(e as Error).message}`)
  } finally {
    unbindProgress?.()
    unbindProgress = null
  }
}

export function cancelImportFlow(): void {
  if (importFlow.stage === 'confirm') {
    importFlow.stage = 'idle'
  }
}

export function closeImportFlow(): void {
  importFlow.stage = 'idle'
  importFlow.entries = []
  importFlow.report = null
}

/** 拖拽导入:文件列表 → 确认(默认引用方式) */
export function importDroppedFiles(files: File[]): void {
  const paths = files
    .map((f) => {
      try {
        return window.mv.dialog.pathForFile(f)
      } catch {
        return ''
      }
    })
    .filter(Boolean)
  if (!paths.length) return
  startImportConfirm(paths.map((p) => ({ path: p, isDir: false })), 'reference')
}
