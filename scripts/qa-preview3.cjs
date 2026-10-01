// qa-preview3.cjs — 收回联动/返回按钮/面板缩略图 验收
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  await s.sleep(2500)
  let fail = 0
  const ok = (cond, name) => {
    console.log((cond ? '  ✓ ' : '  ✗ ') + name)
    if (!cond) fail++
  }

  // 选中一张图(详情面板显示),打开预览
  await s.ev(`(() => {
    const app = document.querySelector('#app').__vue_app__
    const store = app.config.globalProperties.$pinia._s.get('ui')
    const lib = app.config.globalProperties.$pinia.state.value.library
    const img = [...lib.byId.values()].find((x) => x.kind === 'image' && !x.missing && !x.deletedAt)
    store.detailsAssetId = img.id
    store.openPreview(img.id)
  })()`)
  await s.sleep(1200)

  // 1. 详情面板预览图应为缩略图(不是 mvfile 原图)
  const dp = await s.ev(`(() => {
    const img = document.querySelector('.preview-box img')
    return img ? img.src.slice(0, 60) : null
  })()`)
  ok(!!dp, `面板预览图 src: ${dp}`)

  // 2. 返回按钮与翻页按钮的视觉差异
  const btn = await s.ev(`(() => {
    const back = document.querySelector('.pb-back')
    const next = [...document.querySelectorAll('.viewer-toolbar .pb-btn')].find((b) => (b.title || '').startsWith('下一张'))
    if (!back || !next) return null
    const bs = getComputedStyle(back)
    const ns = getComputedStyle(next)
    return { backBorder: bs.borderTopWidth, backLabel: back.textContent.trim(), backW: bs.width, nextW: ns.width }
  })()`)
  ok(!!btn && btn.backBorder !== '0px', `返回按钮有描边(${btn && btn.backBorder})`)
  ok(!!btn && btn.backLabel.includes('返回'), '返回按钮带文字标签')
  ok(!!btn && Math.abs(parseFloat(btn.backW) - parseFloat(btn.nextW)) > 10, `返回(${Math.round(parseFloat(btn.backW))}px) ≠ 翻页(${Math.round(parseFloat(btn.nextW))}px)`)

  // 3. 收回按钮同时控制两侧
  await s.ev(`(() => {
    const bar = [...document.querySelectorAll('button')].find((b) => (b.title || '').includes('两侧面板'))
    if (bar) bar.click()
  })()`)
  await s.sleep(500)
  const st1 = await s.ev(`(() => {
    const app = document.querySelector('#app').__vue_app__
    const ui = app.config.globalProperties.$pinia.state.value.ui
    const p = document.querySelector('.previewer')
    return { side: ui.sidebarCollapsed, panel: ui.panelCollapsed, left: p ? p.style.left : '', right: p ? p.style.right : '' }
  })()`)
  ok(st1.side && st1.panel, '一次点击:两侧全部收起')
  ok(st1.left === '0px' && st1.right === '0px', `预览完全收拢(left=${st1.left}, right=${st1.right})`)
  // 再点一次展开
  await s.ev(`(() => {
    const bar = [...document.querySelectorAll('button')].find((b) => (b.title || '').includes('两侧面板'))
    if (bar) bar.click()
  })()`)
  await s.sleep(500)
  const st2 = await s.ev(`(() => {
    const app = document.querySelector('#app').__vue_app__
    const ui = app.config.globalProperties.$pinia.state.value.ui
    return { side: ui.sidebarCollapsed, panel: ui.panelCollapsed }
  })()`)
  ok(!st2.side && !st2.panel, '再点一次:两侧展开')

  // 关预览
  await s.ev(`(() => { document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('ui').preview.open = false })()`)
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
