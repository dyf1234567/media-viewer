// qa-131.cjs — v1.3.1 验收:重析/排序升序/面板高度/透明/列表缩略图/退出动画
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  await s.sleep(5000) // 等 policy v8 重析推进
  let fail = 0
  const ok = (cond, name) => {
    console.log((cond ? '  ✓ ' : '  ✗ ') + name)
    if (!cond) fail++
  }
  // 复位视图状态(避免残留)
  await s.ev(`(() => {
    const app = document.querySelector('#app').__vue_app__
    const ui = app.config.globalProperties.$pinia.state.value.ui
    ui.viewMode = 'waterfall'
    ui.sortKey = 'imported'
    ui.search = ''
    return true
  })()`)
  await s.sleep(500)

  // 1. policy v8 重析后,ComfyUI 图的正向是 LLM 画面描述(非通配符全文)
  const meta = await s.ev(`(async () => {
    const lib = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.library
    let comfy = null
    for (const a of [...lib.byId.values()]) {
      const f = await window.mv.assets.get(a.id)
      if (f && f.aiMeta && f.aiMeta.source === 'comfyui') { comfy = f; break }
    }
    if (!comfy) return null
    const p = comfy.aiMeta.prompt || ''
    return { len: p.length, hasWildcard: p.includes('{||') || p.includes('{|'), first: p.slice(0, 40) }
  })()`, true)
  ok(meta && !meta.hasWildcard, `重析后无通配符残留(正向 ${meta && meta.len} 字: ${meta && meta.first}…)`)

  // 2. 排序菜单含升序项
  await s.ev(`(() => {
    const app = document.querySelector('#app').__vue_app__
    app.config.globalProperties.$pinia.state.value.ui.sortKey = 'size-asc'
    return true
  })()`)
  await s.sleep(400)
  const orderAsc = await s.ev(`(async () => {
    const app = document.querySelector('#app').__vue_app__
    const ui = app.config.globalProperties.$pinia.state.value.ui
    const lib = app.config.globalProperties.$pinia.state.value.library
    const { applySort } = await import(/* vite 忽略 */ '')
    return null
  })()`, true).catch(() => null)
  // 改用行为验证:设置 size-asc 后第一张应是文件最小的之一
  const firstSmallest = await s.ev(`(() => {
    const app = document.querySelector('#app').__vue_app__
    const lib = app.config.globalProperties.$pinia.state.value.library
    const sizes = [...lib.byId.values()].filter((a) => !a.deletedAt).map((a) => a.fileSize)
    const min = Math.min(...sizes)
    const name = document.querySelector('.card-name')
    const a = [...lib.byId.values()].find((x) => x.fileName === (name ? name.textContent : ''))
    return { min, first: a ? a.fileSize : null }
  })()`)
  ok(firstSmallest.first === firstSmallest.min, `大小升序生效(首张 ${firstSmallest.first} = 库最小 ${firstSmallest.min})`)
  await s.ev(`(() => { document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.ui.sortKey = 'imported' })()`)

  // 3. 面板预览高度 24vh + 半透明
  const pos = await s.center('.card')
  await s.click(pos.x, pos.y)
  await s.sleep(1000)
  const panel = await s.ev(`(() => {
    const box = document.querySelector('.preview-box')
    const det = document.querySelector('.details')
    if (!box || !det) return null
    return { h: Math.round(box.getBoundingClientRect().height), vh: Math.round(window.innerHeight * 0.24), bg: getComputedStyle(det).backgroundColor }
  })()`)
  ok(panel && Math.abs(panel.h - panel.vh) <= 2, `面板预览 24vh(${panel && panel.h}px)`)
  ok(panel && panel.bg.includes('0.5'), `详情面板半透明(${panel && panel.bg})`)
  const sidebarBg = await s.ev(`getComputedStyle(document.querySelector('.sidebar')).backgroundColor`)
  ok(sidebarBg.includes('0.5'), `侧栏半透明(${sidebarBg})`)

  // 4. 列表视图缩略图完整(contain 且更大)
  await s.ev(`(() => {
    const app = document.querySelector('#app').__vue_app__
    app.config.globalProperties.$pinia.state.value.ui.viewMode = 'list'
  })()`)
  await s.sleep(700)
  const list = await s.ev(`(async () => {
    const cell = document.querySelector('.thumb-cell')
    const img = document.querySelector('.thumb-cell img')
    if (!cell || !img) return null
    await new Promise((r) => setTimeout(r, 400))
    const cr = cell.getBoundingClientRect()
    const ir = img.getBoundingClientRect()
    const ratio = ir.width / ir.height
    const natRatio = img.naturalWidth / img.naturalHeight
    return { cellW: Math.round(cr.width), imgW: Math.round(ir.width), imgH: Math.round(ir.height), complete: ir.width <= cr.width + 1 && ir.height <= cr.height + 1 && ratio > 0, ratioOk: Math.abs(ratio - natRatio) < 0.03 }
  })()`, true)
  ok(list && list.cellW >= 58, `列表缩略图加大(${list && list.cellW}px 格)`)
  ok(list && list.complete && list.ratioOk, `缩略图完整显示(${list && list.imgW}x${list && list.imgH},比例一致)`)
  await s.ev(`(() => { document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.ui.viewMode = 'waterfall' })()`)

  // 5. 退出动画:close 后短暂存在 leaving 类再消失
  await s.ev(`(() => {
    const app = document.querySelector('#app').__vue_app__
    const store = app.config.globalProperties.$pinia._s.get('ui')
    const lib = app.config.globalProperties.$pinia.state.value.library
    const img = [...lib.byId.values()].find((x) => x.kind === 'image' && !x.missing && !x.deletedAt)
    store.openPreview(img.id)
  })()`)
  await s.sleep(900)
  const backBtn = await s.ev(`(() => {
    const b = [...document.querySelectorAll('.viewer-toolbar .pb-btn')].find((x) => (x.title || '').startsWith('返回'))
    const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)
  await s.click(backBtn.x, backBtn.y)
  await s.sleep(60)
  const leaving = await s.ev(`(() => { const p = document.querySelector('.previewer'); return p ? p.className.includes('leaving') : false })()`)
  let gone = false
  for (let i = 0; i < 12 && !gone; i++) {
    await s.sleep(100)
    gone = await s.ev(`!document.querySelector('.previewer')`)
  }
  ok(leaving, '退出时播放淡出动画(leaving)')
  ok(gone, '动画后预览关闭')

  console.log(fail ? `✗ ${fail} 项未通过` : '✓ 全部通过')
  console.log('console errors:', s.errors.length)
  s.close()
  process.exit(fail || s.errors.length ? 1 : 0)
}

main().catch((e) => {
  console.error('失败:', e.message)
  process.exit(1)
})
