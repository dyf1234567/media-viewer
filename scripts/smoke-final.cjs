// smoke-final.cjs — 打开项目后的整体冒烟
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  await s.sleep(2500)
  let fail = 0
  const ok = (cond, name) => {
    console.log((cond ? '  ✓ ' : '  ✗ ') + name)
    if (!cond) fail++
  }
  const cards = await s.ev(`document.querySelectorAll('.card').length`)
  ok(cards > 0, `图库加载 ${cards} 张`)
  const dims = await s.ev(`document.querySelectorAll('.filterbar .dim-btn').length`)
  ok(dims === 5, `筛选行 ${dims} 个标签`)
  // 打开预览:渐进加载 + 侧栏避让
  await s.ev(`(() => {
    const app = document.querySelector('#app').__vue_app__
    const store = app.config.globalProperties.$pinia._s.get('ui')
    const lib = app.config.globalProperties.$pinia.state.value.library
    const img = [...lib.byId.values()].find((x) => x.kind === 'image' && !x.missing && !x.deletedAt)
    store.openPreview(img.id)
  })()`)
  await s.sleep(1500)
  const pv = await s.ev(`(() => {
    const img = document.querySelector('.view-img')
    const p = document.querySelector('.previewer')
    return {
      open: !!p,
      visible: img ? img.style.display !== 'none' : false,
      cssW: img ? img.style.width : '',
      left: p ? p.style.left : '',
      pct: document.querySelector('.zoom-pct') ? document.querySelector('.zoom-pct').textContent : ''
    }
  })()`)
  ok(pv.open && pv.visible, '预览打开且图片可见')
  ok(/^var\(--sidebar/.test(pv.left), `预览避让侧栏(${pv.left})`)
  ok(pv.cssW && pv.cssW !== '0px', `图层按适配尺寸栅格化(${pv.cssW})`)
  ok(pv.pct === '100%' || pv.pct.endsWith('%'), `缩放 ${pv.pct}`)
  await s.ev(`(() => { document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('ui').preview.open = false })()`)
  await s.sleep(300)
  console.log(fail ? `✗ ${fail} 项未通过` : '✓ 冒烟全部通过')
  console.log('console errors:', s.errors.length)
  s.close()
  process.exit(fail || s.errors.length ? 1 : 0)
}

main().catch((e) => {
  console.error('失败:', e.message)
  process.exit(1)
})
