// test-fitview.cjs — 判别:fitView 逻辑 vs watcher 触发
const { session } = require('./cdp.cjs')
async function main() {
  const s = await session()
  await s.reload()
  await s.sleep(2000)
  await s.ev(`(() => {
    const app = document.querySelector('#app').__vue_app__
    const store = app.config.globalProperties.$pinia._s.get('ui')
    const lib = app.config.globalProperties.$pinia.state.value.library
    const small = [...lib.byId.values()].filter((x) => x.kind === 'image' && !x.missing && !x.deletedAt).sort((a, b) => a.width * a.height - b.width * b.height)[0]
    store.openPreview(small.id)
  })()`)
  await s.sleep(1000)
  const before = await s.ev(`document.querySelector('.zoom-pct').textContent`)
  // 按 0 键触发 resetView
  await s.key('0', 'Digit0', 48)
  await s.sleep(500)
  const after = await s.ev(`(() => {
    const img = document.querySelector('.view-img')
    return { pct: document.querySelector('.zoom-pct').textContent, style: img.getAttribute('style') }
  })()`)
  console.log(`按键前: ${before}`)
  console.log(`按 0 后:`, JSON.stringify(after))
  s.close()
}
main().catch((e) => { console.error(e.message); process.exit(1) })
