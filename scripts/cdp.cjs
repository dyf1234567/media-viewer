// 公用 CDP 会话驱动:模拟键鼠 + 收集控制台错误/未捕获异常
const http = require('http')

function list() {
  return new Promise((res, rej) => {
    http
      .get({ host: '127.0.0.1', port: 9222, path: '/json/list' }, (r) => {
        let d = ''
        r.on('data', (c) => (d += c))
        r.on('end', () => res(JSON.parse(d)))
      })
      .on('error', rej)
  })
}

async function session() {
  const targets = await list()
  const page = targets.find((t) => t.type === 'page')
  if (!page) throw new Error('未找到页面目标')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r, j) => {
    ws.addEventListener('open', r)
    ws.addEventListener('error', j)
  })
  let seq = 0
  const pending = new Map()
  const errors = []
  ws.addEventListener('message', (m) => {
    const msg = JSON.parse(typeof m.data === 'string' ? m.data : m.toString())
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result)
      return
    }
    if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'warning')) {
      errors.push({
        kind: 'console.' + msg.params.type,
        text: (msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 220)
      })
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails
      errors.push({
        kind: 'exception',
        text: ((d.exception && (d.exception.description || d.exception.value)) || d.text || '').slice(0, 220)
      })
    }
  })
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const id = ++seq
      const timer = setTimeout(() => {
        pending.delete(id)
        rej(new Error(`CDP ${method} 超时(30s)`))
      }, 30000)
      pending.set(id, {
        res: (v) => {
          clearTimeout(timer)
          res(v)
        },
        rej: (e) => {
          clearTimeout(timer)
          rej(e)
        }
      })
      ws.send(JSON.stringify({ id, method, params }))
    })
  await send('Runtime.enable')
  await send('Page.enable')

  const ev = async (expression, awaitPromise = false) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise })
    if (r.exceptionDetails) throw new Error('evaluate 失败: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200))
    return r.result.value
  }
  const key = async (k, code, vk, modifiers = 0) => {
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers })
  }
  const mouse = {
    move: (x, y, modifiers = 0) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, modifiers }),
    down: (x, y, { button = 'left', count = 1, modifiers = 0 } = {}) =>
      send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount: count, modifiers }),
    up: (x, y, { button = 'left', count = 1, modifiers = 0 } = {}) =>
      send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount: count, modifiers })
  }
  const click = async (x, y, opts = {}) => {
    await mouse.move(x, y)
    await mouse.down(x, y, opts)
    await mouse.up(x, y, opts)
  }
  const center = async (sel, idx = 0) => {
    const r = await ev(`(() => {
      const els = document.querySelectorAll(${JSON.stringify(sel)})
      const e = els[${idx}]
      if (!e) return null
      e.scrollIntoView({ block: 'nearest' })
      const r = e.getBoundingClientRect()
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), n: els.length }
    })()`)
    if (!r) return null
    await new Promise((s) => setTimeout(s, 120))
    return r
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const reload = async () => {
    await send('Page.reload')
    await sleep(2500)
  }
  return { ws, send, ev, key, mouse, click, center, sleep, reload, errors, close: () => ws.close() }
}

module.exports = { session }
