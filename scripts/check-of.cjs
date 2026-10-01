// check-of.cjs — 运行时检查面板 img 的 object-fit 与元素结构
const { session } = require('./cdp.cjs')
async function main() {
  const s = await session()
  const r = await s.ev(`(() => {
    const img = document.querySelector('.preview-box img')
    if (!img) return '无 img'
    const cs = getComputedStyle(img)
    return {
      objectFit: cs.objectFit,
      width: cs.width,
      height: cs.height,
      inlineStyle: img.getAttribute('style'),
      complete: img.complete,
      naturalW: img.naturalWidth,
      rect: (() => { const r = img.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height) })()
    }
  })()`)
  console.log(JSON.stringify(r, null, 1))
  s.close()
}
main().catch((e) => { console.error(e.message); process.exit(1) })
