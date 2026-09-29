// 应用更新:GitHub Releases 渠道(electron-updater)
// 开发模式(未打包)不检查;打包版启动 5 秒后自动检查,设置页可手动检查
import { app, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import { broadcast } from './services/emitter'

export interface UpdaterStatus {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  version: string | null
  progress: number | null
  error: string | null
  current: string
}

const state: UpdaterStatus = { status: 'idle', version: null, progress: null, error: null, current: app.getVersion() }

function push(): void {
  broadcast('up:status', { ...state })
}

export function setupUpdater(): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => {
    Object.assign(state, { status: 'checking', version: null, progress: null, error: null })
    push()
  })
  autoUpdater.on('update-available', (info) => {
    Object.assign(state, { status: 'downloading', version: info.version })
    push()
  })
  autoUpdater.on('update-not-available', () => {
    Object.assign(state, { status: 'not-available', version: null })
    push()
  })
  autoUpdater.on('download-progress', (p) => {
    Object.assign(state, { status: 'downloading', progress: Math.round(p.percent) })
    push()
  })
  autoUpdater.on('update-downloaded', (info) => {
    Object.assign(state, { status: 'downloaded', version: info.version, progress: 100 })
    push()
  })
  autoUpdater.on('error', (e) => {
    Object.assign(state, { status: 'error', error: e.message })
    push()
  })

  ipcMain.handle('up:check', async (): Promise<UpdaterStatus> => {
    if (!app.isPackaged) {
      return { status: 'not-available', version: null, progress: null, error: '开发模式不检查更新', current: app.getVersion() }
    }
    try {
      await autoUpdater.checkForUpdates()
    } catch (e) {
      return { ...state, status: 'error', error: (e as Error).message }
    }
    return { ...state }
  })
  ipcMain.handle('up:install', (): boolean => {
    if (state.status !== 'downloaded') return false
    setTimeout(() => autoUpdater.quitAndInstall(), 200)
    return true
  })

  // 启动后延迟自动检查,避免抢启动带宽
  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {
        /* 离线/网络失败不打扰 */
      })
    }, 5000)
  }
}
