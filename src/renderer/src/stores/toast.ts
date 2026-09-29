import { defineStore } from 'pinia'

export interface Toast {
  id: number
  msg: string
  type: 'info' | 'error' | 'success'
}

let nextId = 1

/** 全局错误/状态提示条:4 秒后自动消失,点击可关闭 */
export const useToastStore = defineStore('toast', {
  state: () => ({
    list: [] as Toast[]
  }),
  actions: {
    push(msg: string, type: Toast['type'] = 'info'): void {
      const t: Toast = { id: nextId++, msg, type }
      this.list.push(t)
      setTimeout(() => this.dismiss(t.id), 4000)
    },
    error(msg: string): void {
      this.push(msg, 'error')
    },
    success(msg: string): void {
      this.push(msg, 'success')
    },
    dismiss(id: number): void {
      this.list = this.list.filter((t) => t.id !== id)
    }
  }
})

/** 统一的 IPC 错误提示 */
export function toastError(e: unknown): void {
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e)
  useToastStore().error(msg.replace(/^Error:\s*/, ''))
}
