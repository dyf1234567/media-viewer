import { BrowserWindow, app, shell } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { getConfig, setConfig } from './services/config'

function isDev(): boolean {
  return !app.isPackaged && !!process.env['ELECTRON_RENDERER_URL']
}

let mainWindow: BrowserWindow | null = null

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

function indexUrl(): { url?: string; file?: string } {
  if (isDev()) {
    return { url: process.env['ELECTRON_RENDERER_URL'] }
  }
  return { file: path.join(__dirname, '../renderer/index.html') }
}

export function loadIndex(win: BrowserWindow): void {
  const { url, file } = indexUrl()
  if (url) win.loadURL(url)
  else win.loadFile(file!)
}

export function sendWinState(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  win.webContents.send('win:state', {
    maximized: win.isMaximized(),
    pinned: win.isAlwaysOnTop()
  })
}

export function createMainWindow(): BrowserWindow {
  const cfg = getConfig()
  const bounds = cfg.winBounds
  const win = new BrowserWindow({
    width: bounds?.width || 1280,
    height: bounds?.height || 820,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 720,
    minHeight: 520,
    frame: false,
    show: false,
    backgroundColor: '#0f1014',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      sandbox: false
    }
  })
  mainWindow = win
  win.on('ready-to-show', () => {
    if (cfg.winMaximized) win.maximize()
    win.show()
    sendWinState(win)
  })

  loadIndex(win)

  // 外部链接交给系统浏览器
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const saveBounds = (): void => {
    if (win.isDestroyed() || win.isMinimized()) return
    setConfig({
      winBounds: win.getNormalBounds(),
      winMaximized: win.isMaximized()
    })
  }
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  const debouncedSave = (): void => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(saveBounds, 800)
  }
  win.on('resized', debouncedSave)
  win.on('moved', debouncedSave)
  win.on('maximize', () => sendWinState(win))
  win.on('unmaximize', () => sendWinState(win))
  win.on('always-on-top-changed', () => sendWinState(win))
  win.on('close', saveBounds)

  // 界面崩溃兜底页:重载窗口 / 关闭应用 / 查看错误详情
  win.webContents.on('render-process-gone', (_e, details) => {
    loadCrashPage(win, `渲染进程异常退出\n\n原因: ${details.reason}\n退出码: ${details.exitCode}`)
  })

  return win
}

function loadCrashPage(win: BrowserWindow, errorText: string): void {
  if (win.isDestroyed()) return
  try {
    const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Media Viewer</title>
<style>
  body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;
    background:#16171c;color:#e8e8ec;font-family:system-ui,"Microsoft YaHei",sans-serif}
  .card{max-width:560px;padding:40px;text-align:center}
  h1{font-size:20px;font-weight:600;margin:0 0 12px}
  p{color:#9a9ba3;font-size:14px;line-height:1.6;margin:0 0 24px;white-space:pre-wrap}
  .btns{display:flex;gap:12px;justify-content:center}
  button{border:0;border-radius:8px;padding:10px 20px;font-size:14px;cursor:pointer;
    background:#3a3b42;color:#e8e8ec}
  button.primary{background:#4f7cff;color:#fff}
  pre{display:none;text-align:left;background:#0d0e12;border-radius:8px;padding:12px;
    font-size:12px;color:#ffb4b4;max-height:200px;overflow:auto;margin-top:16px}
</style></head><body>
<div class="card">
  <h1>界面出现了一点问题</h1>
  <p>素材文件与图库记录不受影响。<br>你可以重载窗口继续使用,或查看错误详情。</p>
  <div class="btns">
    <button class="primary" id="btn-reload">重载窗口</button>
    <button id="btn-close">关闭应用</button>
    <button onclick="var p=document.getElementById('d');p.style.display=p.style.display==='block'?'none':'block'">查看错误详情</button>
  </div>
  <pre id="d"></pre>
</div>
<script>
  document.getElementById('d').textContent = ${JSON.stringify(errorText)};
  document.getElementById('btn-reload').onclick = function () {
    if (window.mv && window.mv.win) window.mv.win.reload();
  };
  document.getElementById('btn-close').onclick = function () {
    if (window.mv && window.mv.win) window.mv.win.close();
    else window.close();
  };
</script>
</body></html>`
    const p = path.join(app.getPath('userData'), 'crash.html')
    fs.writeFileSync(p, html, 'utf8')
    win.loadFile(p)
  } catch {
    /* 兜底页失败则保持空白 */
  }
}
