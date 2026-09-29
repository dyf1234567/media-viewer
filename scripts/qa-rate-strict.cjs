// 严格对照:选中卡名 + 点前/点后 UI 填充 + 主进程该卡 rating
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

  // 展开详情面板(若收起)并选中第一张图片卡
  await ev(`(() => { if(!document.querySelector('.details')){ const b=[...document.querySelectorAll('.toolbar button')].find(x=>/详情面板/.test(x.title)); b?.click(); } return true })()`)
  await new Promise((r) => setTimeout(r, 400))
  await ev(`(() => { const cards=[...document.querySelectorAll('.card')]; const c=cards.find(x=>!x.querySelector('.kind-badge')); c?.click(); return !!c })()`)
  await new Promise((r) => setTimeout(r, 1000))

  const out = { port }
  // 面板显示的文件名 + 点前填充
  out.panelName = await ev(`(() => { const p=document.querySelector('.details'); return p.querySelector('.file-name')?.textContent ?? p.textContent.slice(0,30) })()`)
  out.filledBefore = await ev(`(() => { const p=document.querySelector('.details'); return p.querySelectorAll('.stars button.star.on').length })()`)
  out.mainBefore = await ev(
    `window.mv.assets.list().then(r => { const a = r.assets.find(x => x.fileName === ${JSON.stringify('${name}')} ) ; return a ? a.rating : 'not-found' })`.replace("JSON.stringify('${name}')", `JSON.stringify(window.__panelName)`),
    true
  ).catch((e) => 'ERR ' + e.message)
  // 用两步:先取名字再查
  out.mainBefore = await ev(`(async () => { const n = document.querySelector('.details .file-name')?.textContent; const r = await window.mv.assets.list(); const a = r.assets.find(x => x.fileName === n); return { name: n, rating: a?.rating } })()`, true)

  // 点第 5 颗星(该卡 rating<5 时为设 5)
  await ev(`(() => { const p=document.querySelector('.details'); const s=p.querySelectorAll('.stars button.star')[4]; s?.click(); return !!s })()`)
  await new Promise((r) => setTimeout(r, 1500))
  out.filledAfter = await ev(`(() => { const p=document.querySelector('.details'); return p.querySelectorAll('.stars button.star.on').length })()`)
  out.mainAfter = await ev(`(async () => { const n = document.querySelector('.details .file-name')?.textContent; const r = await window.mv.assets.list(); const a = r.assets.find(x => x.fileName === n); return a?.rating })()`, true)

  console.log(JSON.stringify(out, null, 1))
  w.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
