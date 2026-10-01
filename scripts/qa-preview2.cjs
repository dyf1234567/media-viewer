// qa-preview2.cjs — 验证渐进加载/侧栏避让/基础交互
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  await s.sleep(2500)
  let fail = 0
  const ok = (cond, name) => {
    console.log((cond ? '  ✓ ' : '  ✗ ') + name)
    if (!cond) fail++
  }

  // 打开预览,立即抓 src(应为缩略图),再等原图替换
  await s.ev(`(() => {
    const app = document.querySelector('#app').__vue_app__
    const store = app.config.globalProperties.$pinia._s.get('ui')
    const lib = app.config.globalProperties.$pinia.state.value.library
    const imgs = [...lib.byId.values()].filter((x) => x.kind === 'image' && !x.missing && !x.deletedAt)
    imgs.sort((a, b) => b.width * b.height - a.width * a.height)
    store.openPreview(imgs[0].id)
  })()`)
  await s.sleep(120)
  const early = await s.ev(`(() => {
    const img = document.querySelector('.view-img')
    return { src: img ? (img.src.includes('thumb') ? 'thumb' : img.src.slice(0, 40)) : 'none', w: img ? img.style.width : '' }
  })()`)
  console.log('  打开后 120ms src =', early.src, '| CSS 尺寸 =', early.w)
  await s.sleep(2500)
  const late = await s.ev(`(() => {
    const img = document.querySelector('.view-img')
    const p = document.querySelector('.previewer')
    return {
      srcFull: img ? img.src.includes('mv://') : false,
      visible: img ? img.style.display !== 'none' : false,
      left: p ? p.style.left : '',
      pct: document.querySelector('.zoom-pct') ? document.querySelector('.zoom-pct').textContent : ''
    }
  })()`)
  ok(late.srcFull, '原图替换缩略图(mv:// 协议)')
  ok(late.visible, '图片可见')
  ok(/^var\(--sidebar/.test(late.left), `预览区左侧避让侧栏 (${late.left})`)
  ok(!!late.pct, `缩放指示 ${late.pct}`)

  // 侧栏收起按钮在预览打开时生效
  await s.ev(`(() => {
    const bar = [...document.querySelectorAll('.tb-btn, button')].find((b) => (b.title || '').includes('侧栏'))
    if (bar) bar.click()
  })()`)
  await s.sleep(400)
  const collapsed = await s.ev(`(() => {
    const app = document.querySelector('#app').__vue_app__
    const ui = app.config.globalProperties.$pinia.state.value.ui
    const p = document.querySelector('.previewer')
    return { flag: ui.sidebarCollapsed, left: p ? p.style.left : '' }
  })()`)
  ok(collapsed.flag && collapsed.left.includes('collapsed'), '侧栏收起按钮生效,预览区跟随避让')
  // 恢复
  await s.ev(`(() => {
    const app = document.querySelector('#app').__vue_app__
    app.config.globalProperties.$pinia._s.get('ui').sidebarCollapsed = false
    app.config.globalProperties.$pinia._s.get('ui').preview.open = false
  })()`)
  await s.sleep(300)

  console.log(fail ? `✗ ${fail} 项未通过` : '✓ 全部通过')
  console.log('console errors:', s.errors.length)
  s.close()
  process.exit(fail || s.errors.length ? 1 : 0)
}

main().catch((e) => {
  console.error('失败:', e.message)
  process.exit(1)
})
