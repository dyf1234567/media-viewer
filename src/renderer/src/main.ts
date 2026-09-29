import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { vLazyImg } from './directives/lazyImg'
import './styles/base.css'

const app = createApp(App)
app.use(createPinia())
app.directive('lazy-img', vLazyImg)

// 渲染层兜底:未捕获错误显示崩溃页(重载 / 关闭 / 错误详情)
let crashShown = false
function showCrashOverlay(message: string, source: string): void {
  if (crashShown) return
  crashShown = true
  const el = document.createElement('div')
  el.id = 'mv-crash-overlay'
  el.innerHTML = `
    <div class="mv-crash-card">
      <h1>界面出现了一点问题</h1>
      <p>素材文件与图库记录不受影响。<br>你可以重载窗口继续使用,或查看错误详情。</p>
      <div class="mv-crash-btns">
        <button data-act="reload">重载窗口</button>
        <button data-act="close">关闭应用</button>
        <button data-act="detail">查看错误详情</button>
      </div>
      <pre style="display:none"></pre>
    </div>`
  const style = document.createElement('style')
  style.textContent = `
    #mv-crash-overlay{position:fixed;inset:0;z-index:99999;background:#16171c;color:#e8e8ec;
      display:flex;align-items:center;justify-content:center;font-family:system-ui,"Microsoft YaHei",sans-serif}
    .mv-crash-card{max-width:560px;padding:40px;text-align:center}
    .mv-crash-card h1{font-size:20px;margin:0 0 12px}
    .mv-crash-card p{color:#9a9ba3;font-size:14px;line-height:1.7;margin:0 0 24px}
    .mv-crash-btns{display:flex;gap:12px;justify-content:center}
    .mv-crash-btns button{border:0;border-radius:8px;padding:10px 20px;font-size:14px;cursor:pointer;background:#3a3b42;color:#e8e8ec}
    .mv-crash-btns button:first-child{background:#4f7cff;color:#fff}
    .mv-crash-card pre{margin-top:16px;background:#0d0e12;border-radius:8px;padding:12px;font-size:12px;color:#ffb4b4;max-height:200px;overflow:auto;text-align:left;white-space:pre-wrap}`
  document.head.appendChild(style)
  document.body.appendChild(el)
  const pre = el.querySelector('pre')!
  pre.textContent = `${source}\n\n${message}`
  el.querySelector<HTMLButtonElement>('[data-act="reload"]')!.onclick = () => location.reload()
  el.querySelector<HTMLButtonElement>('[data-act="close"]')!.onclick = () =>
    void window.mv?.win.close()
  el.querySelector<HTMLButtonElement>('[data-act="detail"]')!.onclick = () => {
    pre.style.display = pre.style.display === 'block' ? 'none' : 'block'
  }
}

app.config.errorHandler = (err, _instance, info) => {
  showCrashOverlay(err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err), `组件错误 (${info})`)
}
window.addEventListener('error', (e) => {
  showCrashOverlay(`${e.message}\n${e.filename}:${e.lineno}`, '未捕获的脚本错误')
})
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason
  showCrashOverlay(r instanceof Error ? `${r.message}\n${r.stack ?? ''}` : String(r), '未处理的异步错误')
})

// 窗口切到后台时暂停动画
document.addEventListener('visibilitychange', () => {
  document.body.classList.toggle('app-backgrounded', document.hidden)
})

// 对话框通用行为:Esc 关闭 + 焦点锁定在最新打开的对话框内(Tab 循环)
window.addEventListener('keydown', (e) => {
  const masks = [...document.querySelectorAll<HTMLElement>('.dlg-mask')]
  const mask = masks[masks.length - 1]
  if (!mask) return
  if (e.key === 'Escape') {
    // 焦点已在框内时由框自身的 keydown.esc 处理器接管
    if (mask.contains(e.target as Node)) return
    const cancel = mask.querySelector<HTMLButtonElement>('[data-cancel]')
    if (cancel) cancel.click()
    else mask.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    return
  }
  if (e.key !== 'Tab') return
  e.preventDefault()
  const focusables = [...mask.querySelectorAll<HTMLElement>(
    'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'
  )].filter((el) => el.offsetParent !== null)
  if (!focusables.length) return
  const idx = focusables.indexOf(document.activeElement as HTMLElement)
  const next = e.shiftKey
    ? (idx <= 0 ? focusables.length - 1 : idx - 1)
    : (idx === focusables.length - 1 ? 0 : idx + 1)
  focusables[next].focus()
})

app.mount('#app')
