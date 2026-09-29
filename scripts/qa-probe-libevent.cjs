// 探针:onLibChanged 事件是否到达 + 点击后 UI 状态树检查
const http = require('http')
const port = Number(process.argv[2] || 9224)

function getJson(path) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port, path }, (r) => {
      let d = ''
      r.on('data', (c) => (d += c))
      r.on('end', () => res(JSON.parse(d)))
    }).on('error', rej)
  })
}

async function main() {
  const list = await getJson('/json/list')
  const page = list.find((t) => t.type === 'page')
  const w = new WebSocket(page.webSocketDebuggerUrl)
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
  const ev = async (e, awaitPromise = false) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise })).result.value

  await new Promise((r) => w.addEventListener('open', r))

  // 挂事件探针(contextBridge 的 onLibChanged 可用)
  await ev(`(() => {
    window.__libEvents = []
    window.mv.onLibChanged(e => window.__libEvents.push({ n: e.upserted.length, names: e.upserted.map(a => a.fileName + ':' + a.rating) }))
    return 'probe-on'
  })()`)

  // 展开面板选中卡
  await ev(`(() => { if(!document.querySelector('.details')){ const b=[...document.querySelectorAll('.toolbar button')].find(x=>/详情面板/.test(x.title)); b?.click(); } return true })()`)
  await new Promise((r) => setTimeout(r, 400))
  await ev(`(() => { const cards=[...document.querySelectorAll('.card')]; const c=cards.find(x=>!x.querySelector('.kind-badge')); c?.click(); return !!c })()`)
  await new Promise((r) => setTimeout(r, 1000))

  const out = {}
  out.before = await ev(`(() => { const p=document.querySelector('.details'); return { name: p.querySelector('.file-name')?.textContent, filled: p.querySelectorAll('.stars button.star.on').length } })()`)

  // 点第 3 颗星
  await ev(`(() => { const p=document.querySelector('.details'); p.querySelectorAll('.stars button.star')[2].click(); return true })()`)
  await new Promise((r) => setTimeout(r, 2000))

  out.events = await ev(`window.__libEvents`)
  out.after = await ev(`(() => { const p=document.querySelector('.details'); return { filled: p.querySelectorAll('.stars button.star.on').length } })()`)
  console.log(JSON.stringify(out, null, 1))
  w.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
