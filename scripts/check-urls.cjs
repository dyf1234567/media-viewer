// check-urls.cjs
const { session } = require('./cdp.cjs')
async function main() {
  const s = await session()
  const r = await s.ev(`(() => {
    const mod = window.__fmt
    return null
  })()`)
  // 直接看当前 img src 与库内 thumbPath/filePath
  const r2 = await s.ev(`(async () => {
    const img = document.querySelector('.view-img')
    const lib = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.library
    const a = [...lib.byId.values()].find((x) => x.fileName.includes('005039'))
    return { imgSrc: img ? img.src.slice(0, 70) : null, thumb: a.thumbPath ? a.thumbPath.slice(0, 50) : null, file: a.filePath.slice(0, 50) }
  })()`, true)
  console.log(JSON.stringify(r2, null, 1))
  s.close()
}
main().catch((e) => { console.error(e.message); process.exit(1) })
