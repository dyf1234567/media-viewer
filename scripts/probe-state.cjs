// probe-state.cjs
const { session } = require('./cdp.cjs')
async function main() {
  const s = await session()
  const st = await s.ev(`(() => {
    const p = document.querySelector('.previewer')
    const img = document.querySelector('.view-img')
    return {
      previewOpen: !!p,
      imgVisible: img ? img.style.display !== 'none' : false,
      imgStyle: img ? img.getAttribute('style') : null,
      natural: img ? img.naturalWidth : 0
    }
  })()`)
  console.log(JSON.stringify(st))
  s.close()
}
main().catch((e) => { console.error('失败:', e.message); process.exit(1) })
