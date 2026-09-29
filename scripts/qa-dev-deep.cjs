// 深诊断:点击星/收藏 → 事件是否触发 + 主进程是否变化 + UI 是否刷新
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

async function main() {
  const list = await getJson('/json/list', 9222)
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

  // 选中第一张图片卡
  await ev(`(() => { const cards=[...document.querySelectorAll('.card')]; const c=cards.find(x=>!x.querySelector('.kind-badge')); c?.click(); return !!c })()`)
  await new Promise((r) => setTimeout(r, 1000))

  const out = {}
  // 在星星和收藏按钮上挂捕获监听,统计事件
  await ev(`(() => {
    window.__hits = []
    const p = document.querySelector('.details')
    const s = p.querySelectorAll('.stars button.star')[4]
    const f = [...p.querySelectorAll('button')].find(b => /收藏/.test(b.title))
    s.addEventListener('click', () => window.__hits.push('star-click'), true)
    f.addEventListener('click', () => window.__hits.push('fav-click'), true)
    return { starBound: !!s, favBound: !!f }
  })()`)

  // 点击前主进程 rating
  out.ratingBefore = await ev(`window.mv.assets.list().then(r => { const a=[...r.assets].find(x=>x.kind==='image'); return a.rating })`, true)

  // DOM click 星(第 5 颗)
  await ev(`(() => { const p=document.querySelector('.details'); p.querySelectorAll('.stars button.star')[4].click(); return true })()`)
  await new Promise((r) => setTimeout(r, 1200))
  out.hitsAfterStar = await ev(`window.__hits`)
  out.ratingAfter = await ev(`window.mv.assets.list().then(r => { const a=[...r.assets].find(x=>x.kind==='image'); return a.rating })`, true)
  out.uiFilledAfter = await ev(`(() => { const p=document.querySelector('.details'); return p.querySelectorAll('.stars button.star.on').length })()`)

  // DOM click 收藏
  await ev(`(() => { const p=document.querySelector('.details'); [...p.querySelectorAll('button')].find(b=>/收藏/.test(b.title)).click(); return true })()`)
  await new Promise((r) => setTimeout(r, 1200))
  out.hitsAll = await ev(`window.__hits`)
  out.favAfter = await ev(`window.mv.assets.list().then(r => { const a=[...r.assets].find(x=>x.kind==='image'); return a.favorite })`, true)
  out.uiFavIcon = await ev(`(() => { const p=document.querySelector('.details'); const b=[...p.querySelectorAll('button')].find(x=>/收藏/.test(x.title)); return b ? b.className : null })()`)

  console.log(JSON.stringify(out, null, 1))
  w.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
