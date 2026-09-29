// 验证三项 UX 改进:状态栏提示条 / Delete 删除确认(含 aria 与焦点) / Esc 关闭
const http = require('http')

function getJson(path) {
  return new Promise((res, rej) => {
    http
      .get({ host: '127.0.0.1', port: 9222, path }, (r) => {
        let d = ''
        r.on('data', (c) => (d += c))
        r.on('end', () => res(JSON.parse(d)))
      })
      .on('error', rej)
  })
}

let WS = global.WebSocket
let wsOpts = null
if (!WS) {
  WS = require('ws')
  wsOpts = { perMessageDeflate: false }
}

let seq = 0
const pending = new Map()

function send(ws, method, params = {}) {
  return new Promise((res, rej) => {
    const id = ++seq
    pending.set(id, { res, rej })
    ws.send(JSON.stringify({ id, method, params }))
  })
}

function key(ws, k, code, vk) {
  return Promise.all([
    send(ws, 'Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk }),
    send(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk })
  ])
}

async function main() {
  const targets = await getJson('/json')
  const page = targets.find((t) => t.type === 'page')
  const ws = wsOpts ? new WS(page.webSocketDebuggerUrl, wsOpts) : new WS(page.webSocketDebuggerUrl)
  await new Promise((r, j) => {
    if (ws.addEventListener) {
      ws.addEventListener('open', r)
      ws.addEventListener('error', j)
    } else {
      ws.on('open', r)
      ws.on('error', j)
    }
  })
  const onMsg = (m) => {
    const raw = typeof m === 'string' ? m : typeof m.data === 'string' ? m.data : m.toString ? m.toString() : ''
    const msg = JSON.parse(raw)
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result)
    }
  }
  if (ws.addEventListener) ws.addEventListener('message', onMsg)
  else ws.on('message', onMsg)
  const ev = async (expr) =>
    (await send(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true })).result.value

  // 1) 状态栏快捷键提示条
  const hintText = await ev(
    `(() => { const el = document.querySelector('.kbd-hint'); return el ? el.textContent.trim() : null })()`
  )
  // 2) 图标 aria-hidden
  const icons = await ev(`document.querySelectorAll('svg.icon[aria-hidden="true"]').length`)

  // 3) Delete 键删除确认流程
  await ev(`document.querySelector('.card')?.click(); true`)
  await new Promise((r) => setTimeout(r, 250))
  await key(ws, 'Delete', 'Delete', 46)
  await new Promise((r) => setTimeout(r, 400))
  const dlg = await ev(`(() => {
    const m = document.querySelector('.dlg-mask')
    if (!m) return { open: false }
    const d = m.querySelector('.dlg')
    const f = document.activeElement
    return {
      open: true,
      role: d?.getAttribute('role'),
      modal: d?.getAttribute('aria-modal'),
      label: d?.getAttribute('aria-label'),
      cancelFocused: !!f && f.hasAttribute('data-cancel'),
      head: d?.querySelector('.dlg-head')?.textContent
    }
  })()`)

  // 4) Esc 关闭
  await key(ws, 'Escape', 'Escape', 27)
  await new Promise((r) => setTimeout(r, 300))
  const escClosed = await ev(`!document.querySelector('.dlg-mask')`)
  // Esc 之后选择不应被清掉(对话框接管了按键)
  const selectionKept = await ev(`document.querySelectorAll('.card.selected').length > 0`)

  console.log(
    JSON.stringify({ hintText, ariaHiddenIcons: icons, deleteDialog: dlg, escClosed, selectionKept }, null, 2)
  )
  ws.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
