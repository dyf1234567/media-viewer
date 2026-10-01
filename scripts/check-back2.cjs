// check-back2.cjs — 打开预览后再查返回按钮
const { session } = require('./cdp.cjs')
async function main() {
  const s = await session()
  await s.sleep(1500)
  await s.ev(`(() => {
    const app = document.querySelector('#app').__vue_app__
    const store = app.config.globalProperties.$pinia._s.get('ui')
    const lib = app.config.globalProperties.$pinia.state.value.library
    const img = [...lib.byId.values()].find((x) => x.kind === 'image' && !x.missing && !x.deletedAt)
    store.openPreview(img.id)
  })()`)
  await s.sleep(1200)
  const r = await s.ev(`(() => {
    const b = document.querySelector('.pb-back')
    const titles = [...document.querySelectorAll('.viewer-toolbar .pb-btn')].map((x) => x.title)
    return { back: b ? b.className + '|' + b.textContent.trim() : '无', n: titles.length, titles: titles.slice(0, 5) }
  })()`)
  console.log(JSON.stringify(r, null, 1))
  s.close()
}
main().catch((e) => { console.error(e.message); process.exit(1) })
