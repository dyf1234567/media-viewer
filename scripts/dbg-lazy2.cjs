// dbg-lazy2.cjs — 手动赋 src + 容器样式检查
const { session } = require('./cdp.cjs')
async function main() {
  const s = await session()
  await s.ev(`(() => { document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.ui.viewMode = 'list' })()`)
  await s.sleep(1000)
  const r = await s.ev(`(async () => {
    const img = document.querySelector('.thumb-cell img')
    img.src = img.dataset.lazySrc
    await new Promise((r2) => setTimeout(r2, 600))
    const grid = document.querySelector('.grid-body, .grid-scroll, .asset-grid')
    const cs = grid ? getComputedStyle(grid) : null
    return {
      manualW: img.naturalWidth,
      gridClass: grid ? grid.className : null,
      contain: cs ? cs.contain : null,
      contentVisibility: cs ? cs.contentVisibility : null,
      transform: cs ? cs.transform : null
    }
  })()`, true)
  console.log(JSON.stringify(r, null, 1))
  // 顺便数一下页面里有多少 IO 实例观察中(无法直接枚举,跳过)
  s.close()
}
main().catch((e) => { console.error(e.message); process.exit(1) })
