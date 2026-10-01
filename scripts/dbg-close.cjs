// dbg-close.cjs — 关闭流程调试 + 列表缩略图状态
const { session } = require('./cdp.cjs')
async function main() {
  const s = await session()
  // 列表缩略图
  await s.ev(`(() => { document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.ui.viewMode = 'list' })()`)
  await s.sleep(1200)
  const list = await s.ev(`(() => {
    const imgs = [...document.querySelectorAll('.thumb-cell img')]
    return imgs.slice(0, 4).map((i) => ({
      src: i.src.slice(-20), complete: i.complete, w: Math.round(i.getBoundingClientRect().width), h: Math.round(i.getBoundingClientRect().height),
      nat: i.naturalWidth + 'x' + i.naturalHeight, op: getComputedStyle(i).opacity, disp: getComputedStyle(i).display
    }))
  })()`)
  console.log('列表缩略图:', JSON.stringify(list, null, 1))
  await s.ev(`(() => { document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.ui.viewMode = 'waterfall' })()`)

  // 关闭流程
  await s.ev(`(() => {
    const app = document.querySelector('#app').__vue_app__
    const store = app.config.globalProperties.$pinia._s.get('ui')
    const lib = app.config.globalProperties.$pinia.state.value.library
    const img = [...lib.byId.values()].find((x) => x.kind === 'image' && !x.missing && !x.deletedAt)
    store.openPreview(img.id)
  })()`)
  await s.sleep(800)
  const backBtn = await s.ev(`(() => {
    const b = [...document.querySelectorAll('.viewer-toolbar .pb-btn')].find((x) => (x.title || '').startsWith('返回'))
    const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)
  await s.click(backBtn.x, backBtn.y)
  for (const t of [80, 200, 400]) {
    await new Promise((r) => setTimeout(r, t === 80 ? 80 : t - (t === 200 ? 80 : 200)))
    const st = await s.ev(`(() => {
      const app = document.querySelector('#app').__vue_app__
      const ui = app.config.globalProperties.$pinia.state.value.ui
      return { open: ui.preview.open, dom: !!document.querySelector('.previewer'), cls: document.querySelector('.previewer') ? document.querySelector('.previewer').className : '' }
    })()`)
    console.log(`+${t}ms:`, JSON.stringify(st))
  }
  s.close()
}
main().catch((e) => { console.error(e.message); process.exit(1) })
