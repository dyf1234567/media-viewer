// qa-pill.cjs
const { session } = require('./cdp.cjs')
async function main() {
  const s = await session()
  await s.ev(`(() => {
    const app = document.querySelector('#app').__vue_app__
    app.config.globalProperties.$pinia.state.value.ui.search = '小红图'
    return true
  })()`)
  await s.sleep(600)
  const pos = await s.center('.card')
  await s.click(pos.x, pos.y)
  await s.sleep(900)
  const r = await s.ev(`(() => {
    const panel = document.querySelector('.details')
    return { pill: !!panel.querySelector('.colors-pill'), dots: panel.querySelectorAll('.colors-pill .color-dot').length }
  })()`)
  console.log('小红图:', JSON.stringify(r))
  await s.ev(`(() => { document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.ui.search = '' })()`)
  s.close()
}
main().catch((e) => { console.error(e.message); process.exit(1) })
