// dump-style.cjs — 读运行中 img 的完整 style 属性
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
  await s.sleep(1200)
  const r = await s.ev(`(() => {
    const img = document.querySelector('.view-img')
    return {
      attr: img ? img.getAttribute('style') : '无元素',
      w: img ? img.getBoundingClientRect().width : 0,
      h: img ? img.getBoundingClientRect().height : 0,
      natural: img ? img.naturalWidth + 'x' + img.naturalHeight : ''
    }
  })()`)
  console.log(JSON.stringify(r, null, 1))
  s.close()
}
main().catch((e) => { console.error(e.message); process.exit(1) })
