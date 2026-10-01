// restore-asset.cjs — 把测试用长条图转回原始方向
const { session } = require('./cdp.cjs')
async function main() {
  const s = await session()
  const r = await s.ev(`(async () => {
    const lib = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.library
    const a = [...lib.byId.values()].find((x) => x.fileName.includes('长条'))
    await window.mv.editor.apply({ id: a.id, rotate: 90 })
    const f = await window.mv.assets.get(a.id)
    return f.width + 'x' + f.height
  })()`, true)
  console.log('已转回:', r)
  s.close()
}
main().catch((e) => { console.error(e.message); process.exit(1) })
