// probe-setup.cjs — 读 Previewer 组件 setupState
const { session } = require('./cdp.cjs')
async function main() {
  const s = await session()
  await s.reload()
  await s.sleep(2000)
  await s.ev(`(() => {
    const app = document.querySelector('#app').__vue_app__
    const store = app.config.globalProperties.$pinia._s.get('ui')
    const lib = app.config.globalProperties.$pinia.state.value.library
    const small = [...lib.byId.values()].filter((x) => x.kind === 'image' && !x.missing && !x.deletedAt).sort((a, b) => a.width * a.height - b.width * b.height)[0]
    store.openPreview(small.id)
  })()`)
  await s.sleep(1000)
  const r = await s.ev(`(() => {
    const el = document.querySelector('.previewer')
    if (!el) return '无预览'
    const inst = el.__vueParentComponent
    if (!inst) return '无实例'
    const st = inst.setupState
    return {
      keys: Object.keys(st).slice(0, 40).join(','),
      stageEl: st.stageEl ? '有' : 'null',
      natural: JSON.stringify(st.natural),
      baseScale: st.baseScale,
      view: JSON.stringify(st.view),
      assetName: st.asset ? st.asset.fileName : null
    }
  })()`)
  console.log(JSON.stringify(r, null, 1))
  s.close()
}
main().catch((e) => { console.error(e.message); process.exit(1) })
