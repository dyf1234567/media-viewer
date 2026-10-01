// qa-128.cjs — 裁切默认全选 / 变换暂存不弹保存 / 面板图不裁切
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  await s.sleep(4000)
  let fail = 0
  const ok = (cond, name) => {
    console.log((cond ? '  ✓ ' : '  ✗ ') + name)
    if (!cond) fail++
  }

  // 打开预览
  await s.ev(`(() => {
    const app = document.querySelector('#app').__vue_app__
    const store = app.config.globalProperties.$pinia._s.get('ui')
    const lib = app.config.globalProperties.$pinia.state.value.library
    const img = [...lib.byId.values()].find((x) => x.kind === 'image' && !x.missing && !x.deletedAt && x.width !== x.height)
    store.openPreview(img.id)
  })()`)
  await s.sleep(1300)

  // 1. 点击旋转:立即生效、无保存遮罩、出现未保存角标、宽高互换
  const before = await s.ev(`(() => { const i = document.querySelector('.view-img'); return { w: i.style.width, h: i.style.height } })()`)
  const rotBtn = await s.ev(`(() => {
    const b = [...document.querySelectorAll('.viewer-toolbar .pb-btn')].find((x) => (x.title || '').startsWith('旋转'))
    const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)
  await s.click(rotBtn.x, rotBtn.y)
  await s.sleep(400)
  const afterRot = await s.ev(`(() => {
    const i = document.querySelector('.view-img')
    return {
      w: i.style.width, h: i.style.height,
      hasRotate: i.style.transform.includes('rotate(90deg)'),
      mask: !!document.querySelector('.saving-mask'),
      chip: !!document.querySelector('.pend-chip')
    }
  })()`)
  ok(Math.abs(parseFloat(afterRot.w) / parseFloat(afterRot.h) - parseFloat(before.h) / parseFloat(before.w)) < 0.02, `旋转后比例互换(${before.w}x${before.h} → ${afterRot.w}x${afterRot.h},已重新适配)`)
  ok(afterRot.hasRotate, '视觉立即旋转(90deg)')
  ok(!afterRot.mask, '无"正在保存"遮罩')
  ok(afterRot.chip, '出现"未保存"角标')

  // 2. 切换图片触发写盘:角标消失、文件时间戳变化
  const idBefore = await s.ev(`document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.ui.preview.assetId`)
  const pathBefore = await s.ev(`(async () => { const f = await window.mv.assets.get(${idBefore}); return { p: f.filePath, m: f.fileModifiedAt } })()`, true)
  const nextBtn = await s.ev(`(() => {
    const b = [...document.querySelectorAll('.viewer-toolbar .pb-btn')].find((x) => (x.title || '').startsWith('下一张'))
    const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)
  await s.click(nextBtn.x, nextBtn.y)
  await s.sleep(1500)
  const pathAfter = await s.ev(`(async () => { const f = await window.mv.assets.get(${idBefore}); return { m: f.fileModifiedAt, w: f.width, h: f.height } })()`, true)
  const chipGone = await s.ev(`!document.querySelector('.pend-chip')`)
  ok(pathAfter.m > pathBefore.m, `切图时已写盘(修改时间 ${pathBefore.m} → ${pathAfter.m})`)
  ok(chipGone, '写盘后角标消失')

  // 3. 裁切默认全选
  const cropBtn = await s.ev(`(() => {
    const b = [...document.querySelectorAll('.viewer-toolbar .pb-btn')].find((x) => (x.title || '').startsWith('裁切'))
    const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)
  await s.click(cropBtn.x, cropBtn.y)
  await s.sleep(600)
  const crop = await s.ev(`(() => {
    const sel = document.querySelector('.sel-window')
    const stage = document.querySelector('.crop-overlay')
    if (!sel || !stage) return null
    const sr = sel.getBoundingClientRect()
    const st = stage.getBoundingClientRect()
    const size = document.querySelector('.crop-size') ? document.querySelector('.crop-size').textContent.trim() : ''
    return {
      selW: Math.round(sr.width), selH: Math.round(sr.height),
      stageW: Math.round(st.width), stageH: Math.round(st.height),
      size,
      hint: document.querySelector('.crop-hint') ? document.querySelector('.crop-hint').textContent : '',
      handles: document.querySelectorAll('.handle').length
    }
  })()`)
  ok(!!crop, '裁切模式打开')
  ok(crop.handles === 8, `8 个拖动把手(四角+四边,实际 ${crop.handles})`)
  // 选区像素尺寸 ≈ 自然尺寸 即为全选(长条图舞台宽≠图宽,全选指选中整个图片区域)
  const natSize = await s.ev(`(() => {
    const app = document.querySelector('#app').__vue_app__
    const ui = app.config.globalProperties.$pinia.state.value.ui
    const lib = app.config.globalProperties.$pinia.state.value.library
    const a = [...lib.byId.values()].find((x) => x.id === ui.preview.assetId)
    return { w: a.width, h: a.height }
  })()`)
  const m = crop.size.match(/(\d+)\s*×\s*(\d+)/)
  const fullSel = m && Math.abs(parseInt(m[1]) - natSize.w) <= 2 && Math.abs(parseInt(m[2]) - natSize.h) <= 2
  ok(fullSel, `默认全选(选区像素 ${crop.size} ≈ 原图 ${natSize.w}×${natSize.h})`)
  ok(crop.size.includes('×'), `像素尺寸显示: ${crop.size}`)
  // 取消裁切(Esc)
  await s.key('Escape', 'Escape', 27)
  await s.sleep(300)

  // 4. 面板预览图不裁切:显示宽高比 === 自然宽高比
  await s.ev(`(() => { document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('ui').closePreview() })()`)
  await s.sleep(400)
  const pos = await s.center('.card')
  await s.click(pos.x, pos.y)
  await s.sleep(1200)
  const panel = await s.ev(`(async () => {
    const img = document.querySelector('.preview-box img')
    if (!img) return null
    await new Promise((r) => setTimeout(r, 300))
    const r = img.getBoundingClientRect()
    const box = document.querySelector('.preview-box').getBoundingClientRect()
    const dispRatio = r.width / r.height
    const natRatio = img.naturalWidth / img.naturalHeight
    return { dispW: Math.round(r.width), dispH: Math.round(r.height), boxW: Math.round(box.width), boxH: Math.round(box.height), natW: img.naturalWidth, natH: img.naturalHeight, ratioOk: Math.abs(dispRatio - natRatio) < 0.02, fitsBox: r.width <= box.width + 1 && r.height <= box.height + 1 }
  })()`, true)
  console.log('    面板详情:', JSON.stringify(panel))
  ok(panel && panel.ratioOk, `面板预览图比例一致不变形(${panel && panel.natW}x${panel && panel.natH} 原图)`)
  ok(panel && panel.fitsBox, `完整显示在容器内(显示 ${panel && panel.dispW}x${panel && panel.dispH} vs 容器 ${panel && panel.boxW}x${panel && panel.boxH})`)

  console.log(fail ? `✗ ${fail} 项未通过` : '✓ 全部通过')
  console.log('console errors:', s.errors.length)
  s.close()
  process.exit(fail || s.errors.length ? 1 : 0)
}

main().catch((e) => {
  console.error('失败:', e.message)
  process.exit(1)
})
