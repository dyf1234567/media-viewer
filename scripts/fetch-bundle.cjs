// fetch-bundle.cjs — 在页面内取回实际执行的 JS 并检查关键代码
const { session } = require('./cdp.cjs')
async function main() {
  const s = await session()
  const r = await s.ev(`(async () => {
    const src = document.querySelector('script').src
    const text = await fetch(src).then((x) => x.text())
    return {
      src: src.slice(-30),
      len: text.length,
      hasWidth: text.includes('Math.round(natural.w*') || text.includes('Math.round(natural.w *'),
      hasNaturalW: (text.match(/natural\\.w/g) || []).length,
      ctx: text.slice(text.indexOf('transformStyle'), text.indexOf('transformStyle') + 240)
    }
  })()`, true)
  console.log(JSON.stringify(r, null, 1))
  s.close()
}
main().catch((e) => { console.error(e.message); process.exit(1) })
