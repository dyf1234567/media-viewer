// probe-setup2.cjs — 从根组件向下找 Previewer 实例
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
    const found = []
    const walk = (inst, depth) => {
      if (!inst || depth > 12) return
      const name = inst.type && (inst.type.__name || inst.type.name)
      if (name === 'Previewer') found.push(inst)
      if (inst.subTree) {
        const walkVNode = (vn, d) => {
          if (!vn || d > 14) return
          if (vn.component) walk(vn.component, depth + 1)
          if (Array.isArray(vn.children)) vn.children.forEach((c) => walkVNode(c, d + 1))
          if (vn.suspense) walkVNode(vn.suspense.activeBranch, d + 1)
        }
        walkVNode(inst.subTree, depth)
      }
    }
    const app = document.querySelector('#app').__vue_app__
    walk(app._instance, 0)
    if (!found.length) return '未找到 Previewer 实例'
    const st = found[0].setupState
    return {
      n: found.length,
      keys: Object.keys(st).join(',').slice(0, 300),
      stageEl: st.stageEl ? '有' : 'null',
      natural: JSON.stringify(st.natural),
      baseScale: st.baseScale,
      view: JSON.stringify(st.view)
    }
  })()`)
  console.log(JSON.stringify(r, null, 1))
  s.close()
}
main().catch((e) => { console.error(e.message); process.exit(1) })
