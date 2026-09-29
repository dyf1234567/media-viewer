// 详情面板评分/收藏诊断(安装版 9224)
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
  const list = await getJson('/json/list', 9224)
  const page = list.find((t) => t.type === 'page')
  const w = new WebSocket(page.webSocketDebuggerUrl)
  let seq = 0
  const pending = new Map()
  const errs = []
  w.addEventListener('message', (m) => {
    const msg = JSON.parse(m.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result)
      pending.delete(msg.id)
    } else if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'warning')) {
      errs.push((msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200))
    } else if (msg.method === 'Runtime.exceptionThrown') {
      errs.push('EXC: ' + ((msg.params.exceptionDetails.exception || {}).description || msg.params.exceptionDetails.text || '').slice(0, 200))
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
  await send('Runtime.enable')

  // 选中一张非视频卡(点 DOM)
  await ev(`(() => { const cards=[...document.querySelectorAll('.card')]; const c=cards.find(x=>!x.querySelector('.kind-badge')); c?.click(); return !!c })()`)
  await new Promise((r) => setTimeout(r, 1200))

  const out = {}
  // 详情面板结构:评分星星与收藏按钮
  out.panel = await ev(`(() => {
    const p = document.querySelector('.details')
    if (!p) return { open: false }
    const stars = p.querySelectorAll('.stars:not(.stars-readonly) button.star')
    const favBtn = [...p.querySelectorAll('button')].find(b => /收藏/.test(b.title + b.textContent))
    return {
      open: true,
      starCount: stars.length,
      favBtn: favBtn ? { title: favBtn.title.slice(0, 20), tag: favBtn.tagName } : null,
      // 面板里可交互星星的命中测试
      hit: stars.length ? (() => {
        const r = stars[3].getBoundingClientRect()
        const chain = document.elementsFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        return chain.slice(0, 3).map(e => e.tagName + '.' + String(e.className).slice(0, 18))
      })() : null
    }
  })()`)

  // 点面板第 4 颗星(DOM click)
  const before = await ev(`window.mv.assets.list().then(r => { const a = [...r.assets].find(x => x.fileName === document.querySelector('.details .name-row, .details')?.textContent.match(/([\\w\\u4e00-\\u9fff-]+\\.(png|jpg|webp|gif))/)?.[1]) || r.assets.find(x => x.kind === 'image'); return a.rating })`, true)
  await ev(`(() => { const p=document.querySelector('.details'); const s=p.querySelectorAll('.stars:not(.stars-readonly) button.star')[3]; if(!s) return 'no-star'; s.click(); return true })()`)
  await new Promise((r) => setTimeout(r, 1000))
  out.afterStarClick = await ev(`(() => { const p=document.querySelector('.details'); const on=p.querySelectorAll('.stars:not(.stars-readonly) button.star.on').length; const ro=p.querySelector('.stars-readonly')?.textContent ?? ''; return { filled: on, readonlyText: ro.slice(0, 12) } })()`)

  // 点收藏
  await ev(`(() => { const p=document.querySelector('.details'); const b=[...p.querySelectorAll('button')].find(x=>/收藏/.test(x.title+x.textContent)); b?.click(); return !!b })()`)
  await new Promise((r) => setTimeout(r, 1000))
  out.afterFav = await ev(`(() => { const p=document.querySelector('.details'); const b=[...p.querySelectorAll('button')].find(x=>/收藏/.test(x.title+x.textContent)); return b ? b.title.slice(0, 24) : null })()`)

  out.errors = errs.slice(0, 5)
  console.log(JSON.stringify(out, null, 1))
  w.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
