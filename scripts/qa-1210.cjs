// qa-1210.cjs — 滚轮线性缩放/面板滚动接管/预览区高度 验收
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
    const img = [...lib.byId.values()].find((x) => x.kind === 'image' && !x.missing && !x.deletedAt)
    store.openPreview(img.id)
  })()`)
  await s.sleep(1500)
  const stage = await s.ev(`(() => {
    const st = document.querySelector('.stage')
    const r = st.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)

  // 1. 滚轮线性缩放:一帧内不同 delta 得到不同缩放量(而非固定步长)
  const pct = () => s.ev(`document.querySelector('.zoom-pct') ? document.querySelector('.zoom-pct').textContent : document.querySelector('.view-img').style.transform`)
  const p0 = await pct()
  // 小滚量 delta=40
  await s.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: stage.x, y: stage.y, deltaX: 0, deltaY: -40 })
  await s.sleep(300)
  const p1 = await pct()
  // 大滚量 delta=240(6 倍滚量)
  await s.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: stage.x, y: stage.y, deltaX: 0, deltaY: -240 })
  await s.sleep(300)
  const p2 = await pct()
  const n0 = parseFloat(p0)
  const n1 = parseFloat(p1)
  const n2 = parseFloat(p2)
  const smallGain = n1 / n0
  const bigGain = n2 / n1
  ok(smallGain > 1.005 && smallGain < 1.06, `小滚量(delta40) 放大 ${smallGain.toFixed(3)} 倍(≈1.033,线性)`)
  const expect6 = Math.pow(smallGain, 6) // 6 倍滚量应对数叠加 6 次小增益
  ok(Math.abs(bigGain - expect6) < 0.06, `大滚量(delta240) 放大 ${bigGain.toFixed(3)} 倍 ≈ 小增益^6(${expect6.toFixed(3)}),严格按滚动量线性叠加`)

  // 2. 面板预览区高度(30vh)
  const h = await s.ev(`(() => {
    const box = document.querySelector('.preview-box')
    if (!box) return null
    return { h: Math.round(box.getBoundingClientRect().height), vh: Math.round(window.innerHeight * 0.3) }
  })()`)
  ok(h && Math.abs(h.h - h.vh) <= 2, `预览区高度 30vh(${h && h.h}px)`)

  // 3. 详情面板上滚动:面板自身滚动,图片不缩放
  const beforePct = await s.ev(`(() => {
    const pct = document.querySelector('.zoom-pct')
    const panel = document.querySelector('.details')
    return { pct: pct ? pct.textContent : '', scrollTop: panel ? panel.scrollTop : 0, scrollH: panel ? panel.scrollHeight : 0, clientH: panel ? panel.clientHeight : 0 }
  })()`)
  const panelPt = await s.ev(`(() => {
    const panel = document.querySelector('.details')
    const r = panel.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + Math.min(r.height - 40, 200)) }
  })()`)
  await s.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: panelPt.x, y: panelPt.y, deltaX: 0, deltaY: 120 })
  await s.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: panelPt.x, y: panelPt.y, deltaX: 0, deltaY: 120 })
  await s.sleep(400)
  const afterPanel = await s.ev(`(() => {
    const pct = document.querySelector('.zoom-pct')
    const panel = document.querySelector('.details')
    return { pct: pct ? pct.textContent : '', scrollTop: panel ? panel.scrollTop : 0 }
  })()`)
  const scrollable = beforePct.scrollH > beforePct.clientH + 10
  ok(afterPanel.pct === beforePct.pct, `面板上滚动图片不缩放(${beforePct.pct} → ${afterPanel.pct})`)
  const atBottom = beforePct.scrollH - beforePct.clientH - beforePct.scrollTop < 10
  ok(!scrollable || atBottom || afterPanel.scrollTop > beforePct.scrollTop, `面板内容自身滚动(scrollTop ${beforePct.scrollTop} → ${afterPanel.scrollTop}${atBottom ? ',已在底部' : ''})`)

  // 收尾:复位缩放并关闭
  await s.key('0', 'Digit0', 48)
  await s.sleep(200)
  await s.ev(`(() => { document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('ui').closePreview() })()`)
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
