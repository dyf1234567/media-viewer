// probe-fam.cjs — 读取渲染端资产色系分布(验证迁移)
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  const r = await s.ev(`(() => {
    const app = document.querySelector('#app').__vue_app__
    const pinia = app.config.globalProperties.$pinia
    const lib = pinia.state.value.library
    const arr = [...lib.byId.values()]
    const dist = {}
    arr.forEach((a) => { const f = a.colorFamily ?? 'null'; dist[f] = (dist[f] || 0) + 1 })
    return { n: arr.length, dist }
  })()`)
  console.log(JSON.stringify(r, null, 2))
  s.close()
}

main().catch((e) => {
  console.error('失败:', e.message)
  process.exit(1)
})
