// 验证 v-lazy-img:接近才设置 src、加载后淡入、骨架存在
const PAGE_WS = process.argv[2]
const ws = new WebSocket(PAGE_WS)
let msgId = 0
const pending = new Map()
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
}
function ev(code) {
  return new Promise((resolve) => {
    const id = ++msgId
    pending.set(id, resolve)
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: code, returnByValue: true } }))
  })
}
async function main() {
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  const m = await ev(`(() => {
    const imgs = [...document.querySelectorAll('img.lazy')]
    return JSON.stringify({
      total: imgs.length,
      withSrc: imgs.filter(i => i.src).length,
      loadedVisible: imgs.filter(i => i.style.opacity === '1').length,
      hasLazyAttr: imgs.every(i => i.dataset.lazySrc !== undefined),
      skeletons: document.querySelectorAll('.thumb-skeleton').length
    })
  })()`)
  console.log(m.result?.result?.value)
  ws.close()
}
main().catch((e) => { console.error('FAIL', e.message); process.exit(1) })
