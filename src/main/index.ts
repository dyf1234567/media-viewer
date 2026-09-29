import { app, protocol } from 'electron'
import { registerProtocolHandler, SCHEME } from './protocol'
import { createMainWindow } from './window'
import { initLibrary } from './services/library'
import { closeDb } from './services/db'
import { registerIpc } from './ipc'
import { setupUpdater } from './updater'
import { runStartupMaintenance } from './services/maintenance'
import { rebuildWatchRoots } from './services/watcher'

// 单实例
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    /* 主窗口已在运行 */
  })

  // 自定义协议需在 ready 前注册权限
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: { supportFetchAPI: true, stream: true, corsEnabled: true, bypassCSP: true }
    }
  ])

  app.setAppUserModelId('com.mediaviewer.app')
  app.whenReady().then(() => {
    try {
      initLibrary()
      registerProtocolHandler()
      registerIpc()
      setupUpdater()
      createMainWindow()
      // 启动自动维护(异步,不阻塞窗口)
      void runStartupMaintenance()
      void rebuildWatchRoots()
    } catch (e) {
      console.error('[boot-fail]', e)
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { dialog } = require('electron') as typeof import('electron')
      dialog.showErrorBox('Media Viewer 启动失败', String((e as Error)?.stack ?? e))
      app.quit()
    }
  })

  app.on('window-all-closed', () => {
    app.quit()
  })

  app.on('will-quit', () => {
    closeDb()
  })
}
