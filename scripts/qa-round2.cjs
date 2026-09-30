// qa-round2.cjs — 本轮全部改动的回归:取色面板/自定义比例/预览同屏/详情面板/右键空白/预览放大
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  await s.reload()
  await s.sleep(1600)
  let fail = 0
  const ok = (cond, name) => {
    console.log((cond ? '  ✓ ' : '  ✗ ') + name)
    if (!cond) fail++
  }

  // 1. 右键菜单 → 点空白关闭并取消选中(坐标取网格最后一行卡片下方,确保是空白)
  console.log('— 右键菜单空白关闭 —')
  const card = await s.center('.card')
  await s.click(card.x, card.y, { button: 'right' })
  await s.sleep(300)
  let st = await s.ev(`({ menu: !!document.querySelector('.ctx-menu'), sel: !!document.querySelector('.card.selected') })`)
  ok(st.menu, '右键菜单打开')
  const blank = await s.ev(`(() => {
    const cards = [...document.querySelectorAll('.card')]
    const last = cards[cards.length - 1]
    const r = last.getBoundingClientRect()
    const y = Math.min(r.bottom + 40, window.innerHeight - 50)
    return { x: Math.round(Math.min(r.x + 30, window.innerWidth - 60)), y: Math.round(y) }
  })()`)
  await s.click(blank.x, blank.y)
  await s.sleep(250)
  st = await s.ev(`({ menu: !!document.querySelector('.ctx-menu'), sel: !!document.querySelector('.card.selected') })`)
  ok(!st.menu, '点空白后菜单关闭')
  ok(!st.sel, '点空白后取消选中')

  // 2. 颜色取色面板
  console.log('— Eagle 取色面板 —')
  const colorBtn = await s.center('.filterbar .dim-btn:nth-child(3)')
  await s.click(colorBtn.x, colorBtn.y)
  await s.sleep(350)
  const pk = await s.ev(`({
    sv: !!document.querySelector('.sv-square'),
    hue: !!document.querySelector('.hue-strip'),
    presets: document.querySelectorAll('.preset').length,
    hex: document.querySelector('.hex-input') ? document.querySelector('.hex-input').placeholder : '',
    bg: (document.querySelector('.sv-square') || {}).style ? document.querySelector('.sv-square').getAttribute('style').includes('linear-gradient') : false
  })`)
  ok(pk.sv && pk.hue, 'SV 渐变方 + 色相条存在')
  ok(pk.presets === 16, `预设色块 16 个(实际 ${pk.presets})`)
  ok(pk.hex === '#FF0000', 'hex 输入框存在')
  ok(pk.bg, 'SV 方渐变背景生效')
  // 点预设第 12 个(绿)
  const preset = await s.center('.preset:nth-child(12)')
  await s.click(preset.x, preset.y)
  await s.sleep(300)
  const chipG = await s.ev(`[...document.querySelectorAll('.chip')].map(c=>c.textContent.trim()).join('|')`)
  ok(chipG.includes('绿'), `预设点选生效: ${chipG}`)
  // hex 输入蓝色
  await s.ev(`(document.querySelector('.hex-input')).value = '#5288FF'`)
  await s.ev(`(document.querySelector('.hex-input')).dispatchEvent(new Event('input'))`)
  const hexBtn = await s.center('.hex-apply')
  await s.click(hexBtn.x, hexBtn.y)
  await s.sleep(300)
  const chipB = await s.ev(`[...document.querySelectorAll('.chip')].map(c=>c.textContent.trim()).join('|')`)
  ok(chipB.includes('蓝'), `hex 输入生效: ${chipB}`)
  // 清空本项
  const clr = await s.center('.pop-footer')
  await s.click(clr.x, clr.y)
  await s.sleep(250)
  ok(await s.ev(`!document.querySelector('.chip')`), '清空本项生效')

  // 3. 形状自定义比例(用库里第一张图的真实比例,必有结果)
  console.log('— 自定义比例 —')
  const shapeBtn = await s.center('.filterbar .dim-btn:nth-child(2)')
  await s.click(shapeBtn.x, shapeBtn.y)
  await s.sleep(300)
  ok(await s.ev(`!!document.querySelector('.custom-ratio')`), '自定义比例输入行存在')
  const realRatio = await s.ev(`(() => {
    const lib = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.library
    const a = [...lib.byId.values()].find((x) => x.kind === 'image' && x.width && x.height)
    return (a.width / a.height).toFixed(3)
  })()`)
  await s.ev(`(document.querySelector('.cr-input')).value = ${JSON.stringify(realRatio)}`)
  await s.ev(`(document.querySelector('.cr-input')).dispatchEvent(new Event('input'))`)
  const cr = await s.center('.cr-apply')
  await s.click(cr.x, cr.y)
  await s.sleep(350)
  const chipR = await s.ev(`[...document.querySelectorAll('.chip')].map(c=>c.textContent.trim()).join('|')`)
  ok(chipR.includes(realRatio), `自定义比例 chip: ${chipR}`)
  const cnt = await s.ev(`document.querySelectorAll('.card').length`)
  ok(cnt > 0, `比例 ${realRatio} 过滤后 ${cnt} 张`)
  // 清空
  await s.ev(`(() => { const u = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.ui; u.filters.shapeCustom = '' })()`)
  await s.sleep(250)

  // 4. 详情面板 Eagle 化(选一张有主题色的 PNG)
  console.log('— 详情面板 —')
  await s.ev(`(() => {
    const app = document.querySelector('#app').__vue_app__
    app.config.globalProperties.$pinia.state.value.ui.search = ''
    return true
  })()`)
  await s.sleep(400)
  const pos2 = await s.ev(`(() => {
    const cards = [...document.querySelectorAll('.card')]
    const c = cards.find((x) => (x.querySelector('.card-name') ? x.querySelector('.card-name').textContent : '').includes('小红图'))
    if (!c) return null
    const r = c.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)
  await s.click(pos2.x, pos2.y)
  await s.sleep(900)
  const dp = await s.ev(`(() => {
    const panel = document.querySelector('.details')
    if (!panel) return null
    const text = panel.textContent
    return {
      pill: !!panel.querySelector('.colors-pill'),
      noteBox: !!panel.querySelector('.note-box'),
      addWide: panel.querySelectorAll('.add-wide').length,
      folds: panel.querySelectorAll('details.fold').length,
      histOpen: (() => { const d = [...panel.querySelectorAll('details.fold')].find(x => x.querySelector('summary').textContent.includes('直方图')); return d ? d.open : false })(),
      order: [...panel.children].map((x) => x.className.split(' ')[0]).slice(0, 8)
    }
  })()`)
  ok(!!dp, '详情面板渲染')
  ok(dp.pill, '色点药丸行存在')
  ok(dp.noteBox, '注释输入框样式存在')
  ok(dp.addWide === 1, `添加文件夹全宽按钮 ${dp.addWide}/1`)
  ok(dp.folds >= 2, `折叠区块 ${dp.folds} 个(生成图无 EXIF/AI 时 2 个属正常)`)
  ok(dp.histOpen, '直方图默认展开')

  // 5. 预览器同屏(右侧面板保留)
  console.log('— 预览器同屏 —')
  await s.ev(`(() => {
    const app = document.querySelector('#app').__vue_app__
    const store = app.config.globalProperties.$pinia.state.value
    const lib = store.library
    const img = [...lib.byId.values()].find((x) => x.kind === 'image' && !x.missing)
    app.config.globalProperties.$pinia._s.get('ui').openPreview(img.id)
    return true
  })()`)
  await s.sleep(900)
  const pv = await s.ev(`(() => {
    const p = document.querySelector('.previewer')
    if (!p) return null
    const r = p.getBoundingClientRect()
    const d = document.querySelector('.details')
    const dr = d ? d.getBoundingClientRect() : null
    return {
      exists: true,
      right: Math.round(r.right),
      panelLeft: dr ? Math.round(dr.left) : -1,
      slider: !!document.querySelector('.zoom-slider'),
      page: document.querySelector('.pv-page') ? document.querySelector('.pv-page').textContent : ''
    }
  })()`)
  ok(!!pv, '预览器打开')
  ok(pv.slider, '缩放滑杆存在')
  ok(Math.abs(pv.right - pv.panelLeft) <= 2, `预览区止于面板左缘 (right=${pv.right}, panel=${pv.panelLeft})`)
  const panelStill = await s.ev(`!!document.querySelector('.details')`)
  ok(panelStill, '详情面板保持可见')
  // 关闭预览
  await s.ev(`(() => { document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('ui').preview.open = false })()`)
  await s.sleep(300)

  console.log(fail ? `✗ ${fail} 项未通过` : '✓ 全部通过')
  console.log('console errors:', s.errors.length)
  s.close()
  process.exit(fail || s.errors.length ? 1 : 0)
}

main().catch((e) => {
  console.error('脚本失败:', e)
  process.exit(1)
})
