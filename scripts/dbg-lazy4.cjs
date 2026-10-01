// dbg-lazy4.cjs — bringToFront 后验证列表缩略图加载(IO)与行高
const { session } = require('./cdp.cjs')
async function main() {
  const s = await session()
  await s.send('Page.bringToFront')
  await s.sleep(800)
  await s.ev(`(() => { document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.ui.viewMode = 'list' })()`)
  await s.sleep(1500)
  const r = await s.ev(`(async () => {
    const rows = [...document.querySelectorAll('.row')]
    const imgs = [...document.querySelectorAll('.thumb-cell img')]
    const loaded = imgs.filter((i) => i.naturalWidth > 0)
    const first = loaded[0]
    const cell = first ? first.closest('.thumb-cell').getBoundingClientRect() : null
    const ir = first ? first.getBoundingClientRect() : null
    return {
      rows: rows.length,
      rowH: rows[0] ? Math.round(rows[0].getBoundingClientRect().height) : -1,
      loaded: loaded.length + '/' + imgs.length,
      imgRect: ir ? Math.round(ir.width) + 'x' + Math.round(ir.height) : null,
      cellRect: cell ? Math.round(cell.width) + 'x' + Math.round(cell.height) : null,
      fits: ir && cell ? ir.height <= cell.height + 1 && ir.width <= cell.width + 1 : null
    }
  })()`, true)
  console.log(JSON.stringify(r, null, 1))
  s.close()
}
main().catch((e) => { console.error(e.message); process.exit(1) })
