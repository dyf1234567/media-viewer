// v1.0.0 → v1.0.1 完整升级闭环:等待下载 → 安装 → 验证新版本与新 UI
const http = require('http')

function getJson(path, port) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port, path }, (r) => {
      let d = ''
      r.on('data', (c) => (d += c))
      r.on('end', () => res(JSON.parse(d)))
    }).on('error', rej)
  })
}

async function connect(port) {
  const list = await getJson('/json/list', port)
  const page = list.find((t) => t.type === 'page')
  if (!page) return null
  const w = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r) => w.addEventListener('open', r))
  let seq = 0
  const pending = new Map()
  w.addEventListener('message', (m) => {
    const msg = JSON.parse(m.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result)
      pending.delete(msg.id)
    }
  })
  const send = (method, params = {}) =>
    new Promise((res) => {
      const id = ++seq
      pending.set(id, res)
      w.send(JSON.stringify({ id, method, params }))
    })
  const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result.value
  return { w, ev }
}

async function main() {
  // 1. 等待下载完成(轮询安装版的更新状态——通过设置页 UI;先直连 CDP 打开设置)
  const s = await connect(9224)
  await s.ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>/设置/.test(x.title||x.textContent)); b?.click(); return true })()`)
  let last = ''
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 3000))
    last = await s.ev(`document.querySelector('.up-status')?.textContent.trim() ?? '(空)'`)
    if (i % 6 === 0) console.log('  ' + last)
    if (/已就绪|失败|错误/.test(last)) break
  }
  console.log('下载状态:', last)
  if (!/已就绪/.test(last)) {
    console.log('未在超时内完成下载(网络速度限制)')
    s.w.close()
    return
  }
  // 2. 重启安装
  const ok = await s.ev(`window.mv.updater.install()`)
  console.log('install 调用:', ok)
  s.w.close()

  // 3. 等应用退出→自动重启(带调试端口参数继承)→验证版本与 UI
  let s2 = null
  for (let t = 0; t < 20 && !s2; t++) {
    await new Promise((r) => setTimeout(r, 3000))
    try {
      s2 = await connect(9224)
    } catch {
      /* 尚未重启 */
    }
  }
  if (!s2) {
    console.log('应用未自动重启(可能未继承调试端口),手动验证版本')
    return
  }
  const ver = await s2.ev(`window.mv ? 'app-ready' : 'no-api'`)
  console.log('重启后:', ver)
  // 打开设置页看版本号
  await s2.ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>/设置/.test(x.title||x.textContent)); b?.click(); return true })()`)
  await new Promise((r) => setTimeout(r, 1500))
  const verLabel = await s2.ev(`document.querySelector('.ver-label')?.textContent ?? '(未开)'`)
  console.log('升级后版本:', verLabel)
  await s2.ev(`(() => { const m=document.querySelector('.dlg-mask'); m?.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); return true })()`)
  // 验证新 UI:加号按钮存在 + 文字按钮只剩排序
  const ui = await s2.ev(`(() => { const t=document.querySelector('.toolbar'); return { plus: !!t.querySelector('.plus-btn'), btns: [...t.querySelectorAll('.btn')].map(b=>b.textContent.trim()).filter(Boolean) } })()`)
  console.log('新工具栏:', JSON.stringify(ui))
  // 验证直方图:点一张图片卡
  await s2.ev(`(() => { const cards=[...document.querySelectorAll('.card')]; const c=cards.find(x=>!x.querySelector('.kind-badge')); c?.click(); return !!c })()`)
  await new Promise((r) => setTimeout(r, 1500))
  const hist = await s2.ev(`(() => { const c=document.querySelector('.hist-canvas'); if(!c) return 'no-canvas'; try { return c.toDataURL().length } catch { return 'err' } })()`)
  console.log('直方图自动绘制:', hist)
  s2.w.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
