// 安装版(9224)诊断:评分收藏无反应
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
  await new Promise((r) => setTimeout(r, 5000))
  const out = {}

  // 1. 主进程 API 直测
  out.api = await ev(`window.mv.assets.list().then(r => { const a = r.assets.find(x => x.kind === 'image' && !x.deletedAt); return window.mv.assets.update(a.id, { rating: 5 }).then(u => ({ ok: true, rating: u.rating, name: a.fileName })).catch(e => ({ ok: false, err: String(e.message).slice(0, 120) })) })`, true)

  // 2. 悬停条可见性(第一张图片卡)
  out.hoverBar = await ev(`(() => {
    const cards = [...document.querySelectorAll('.card')]
    const c = cards.find(x => !x.querySelector('.kind-badge'))
    if (!c) return 'no-img-card'
    const bar = c.querySelector('.hover-bar')
    if (!bar) return 'no-bar'
    const cs = getComputedStyle(bar)
    return { opacity: cs.opacity, z: cs.zIndex, stars: bar.querySelectorAll('button.star').length, fav: !!bar.querySelector('.fav-btn') }
  })()`)

  // 3. 命中层级(星星中心谁在顶)
  out.hitChain = await ev(`(() => {
    const cards = [...document.querySelectorAll('.card')]
    const c = cards.find(x => !x.querySelector('.kind-badge'))
    const s = c.querySelectorAll('.hover-bar button.star')[2]
    if (!s) return 'no-star'
    const r = s.getBoundingClientRect()
    const chain = document.elementsFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    return chain.slice(0, 4).map(e => e.tagName + '.' + String(e.className).slice(0, 20))
  })()`)

  out.errors = errs.slice(0, 5)
  console.log(JSON.stringify(out, null, 1))
  w.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
