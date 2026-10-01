// dbg-lazy.cjs — 列表 img 指令状态
const { session } = require('./cdp.cjs')
async function main() {
  const s = await session()
  await s.ev(`(() => { document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.ui.viewMode = 'list' })()`)
  await s.sleep(1200)
  const r = await s.ev(`(() => {
    const img = document.querySelector('.thumb-cell img')
    if (!img) return '无 img'
    const cell = img.closest('.thumb-cell')
    const row = img.closest('.row')
    return {
      lazySrc: (img.dataset.lazySrc || '').slice(0, 50),
      src: img.src.slice(0, 50),
      rowH: row ? Math.round(row.getBoundingClientRect().height) : -1,
      rowTop: row ? Math.round(row.getBoundingClientRect().top) : -1,
      cellH: cell ? Math.round(cell.getBoundingClientRect().height) : -1,
      inViewport: row ? row.getBoundingClientRect().top < window.innerHeight : false
    }
  })()`)
  console.log(JSON.stringify(r, null, 1))
  s.close()
}
main().catch((e) => { console.error(e.message); process.exit(1) })
