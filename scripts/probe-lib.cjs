// probe-lib.cjs — 查库内资产清单与 aiMeta 状态
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  const r = await s.ev(`(async () => {
    const lib = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.library
    const arr = [...lib.byId.values()]
    const out = []
    for (const a of arr) {
      const full = await window.mv.assets.get(a.id)
      out.push({ id: a.id, name: a.fileName, ai: full && full.aiMeta ? full.aiMeta.source : null, colors: a.colors ? a.colors.length : null })
    }
    return { n: arr.length, list: out }
  })()`, true)
  console.log('资产数:', r.n)
  r.list.forEach((x) => console.log(JSON.stringify(x)))
  s.close()
}

main().catch((e) => {
  console.error('失败:', e.message)
  process.exit(1)
})
