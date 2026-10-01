// debug-fit.cjs — 小图适配调试
const { session } = require('./cdp.cjs')
async function main() {
  const s = await session()
  await s.sleep(1500)
  const pick = await s.ev(`(() => {
    const app = document.querySelector('#app').__vue_app__
    const lib = app.config.globalProperties.$pinia.state.value.library
    const imgs = [...lib.byId.values()].filter((x) => x.kind === 'image' && !x.missing && !x.deletedAt).sort((a, b) => a.width * a.height - b.width * b.height)
    return imgs[0] ? imgs[0].fileName + ' ' + imgs[0].width + 'x' + imgs[0].height : 'none'
  })()`)
  console.log('最小图:', pick)
  await s.ev(`(() => {
    const app = document.querySelector('#app').__vue_app__
    const store = app.config.globalProperties.$pinia._s.get('ui')
    const lib = app.config.globalProperties.$pinia.state.value.library
    const small = [...lib.byId.values()].filter((x) => x.kind === 'image' && !x.missing && !x.deletedAt).sort((a, b) => a.width * a.height - b.width * b.height)[0]
    store.openPreview(small.id)
  })()`)
  for (const delay of [50, 300, 1000]) {
    await new Promise((r) => setTimeout(r, delay === 50 ? 50 : delay - 50))
    const st = await s.ev(`(() => {
      const stage = document.querySelector('.stage')
      const img = document.querySelector('.view-img')
      return {
        stageW: stage ? stage.clientWidth : '无stage',
        imgTransform: img ? img.style.transform : '',
        imgSize: img ? img.style.width + 'x' + img.style.height : '',
        pct: document.querySelector('.zoom-pct') ? document.querySelector('.zoom-pct').textContent : ''
      }
    })()`)
    console.log(`+${delay}ms:`, JSON.stringify(st))
  }
  s.close()
}
main().catch((e) => { console.error(e.message); process.exit(1) })
