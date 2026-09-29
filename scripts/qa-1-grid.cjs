// 测试 1:网格选择模型 / 键盘导航 / 框选 / 悬停信息条
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  await s.reload()
  const out = {}

  out.initial = await s.ev(`(() => ({
    cards: document.querySelectorAll('.card').length,
    scopeText: document.querySelector('.status-bar .scope-chip')?.textContent.trim(),
    statusBar: document.querySelector('.status-bar')?.textContent.trim().slice(0, 80)
  }))()`)

  // 1. 单击选中
  const c0 = await s.center('.card', 0)
  await s.click(c0.x, c0.y)
  await s.sleep(200)
  out.clickSelect = await s.ev(`document.querySelectorAll('.card.selected').length`)

  // 2. Ctrl+单击追加
  const c2 = await s.center('.card', 2)
  await s.click(c2.x, c2.y, { modifiers: 2 })
  await s.sleep(200)
  out.ctrlAdd = await s.ev(`document.querySelectorAll('.card.selected').length`)

  // 3. Shift+单击连选(应替换为 0..2 范围 = 3)
  const c4 = await s.center('.card', 4)
  await s.click(c4.x, c4.y, { modifiers: 8 })
  await s.sleep(200)
  out.shiftRange = await s.ev(`document.querySelectorAll('.card.selected').length`)

  // 4. Ctrl+A 全选 / Esc 取消
  await s.key('a', 'KeyA', 65, 2)
  await s.sleep(150)
  out.selectAll = await s.ev(`document.querySelectorAll('.card.selected').length`)
  await s.key('Escape', 'Escape', 27)
  await s.sleep(150)
  out.escClear = await s.ev(`document.querySelectorAll('.card.selected').length`)

  // 5. 方向键导航 + 滚动跟随
  const c1 = await s.center('.card', 1)
  await s.click(c1.x, c1.y)
  await s.sleep(150)
  await s.key('ArrowRight', 'ArrowRight', 39)
  await s.sleep(120)
  out.arrowRight = await s.ev(`(() => { const sel = document.querySelector('.card.selected'); return sel ? sel.querySelector('.card-name')?.textContent : null })()`)
  await s.key('j', 'KeyJ', 74)
  await s.sleep(120)
  out.jKey = await s.ev(`(() => { const sel = document.querySelector('.card.selected'); return sel ? sel.querySelector('.card-name')?.textContent : null })()`)

  // 6. 空格预览 → Esc 关闭
  await s.key(' ', 'Space', 32)
  await s.sleep(500)
  out.spacePreview = await s.ev(`!!document.querySelector('.previewer')`)
  out.previewPage = await s.ev(`document.querySelector('.previewer')?.textContent.match(/\\d+\\s*\\/\\s*\\d+/)?.[0] ?? null`)
  await s.key('Escape', 'Escape', 27)
  await s.sleep(300)
  out.previewClosed = await s.ev(`!document.querySelector('.previewer')`)

  // 7. 框选:从空白处按下拖到若干卡片
  const empty = await s.ev(`(() => {
    const el = document.querySelector('.waterfall-canvas, .grid-scroll, .grid-container') || document.querySelector('.status-bar')
    return el ? el.className : 'not-found'
  })()`)
  out.scrollHost = empty
  // 找网格空白点:第一张卡片左边或标题栏下方的间隙
  const spot = await s.ev(`(() => {
    const c = document.querySelector('.card')
    if (!c) return null
    const r = c.getBoundingClientRect()
    // 卡片上方 30px(工具栏与卡片之间)通常是空白;再保守:用卡片左侧
    const host = c.closest('[class*=waterfall],[class*=canvas],[class*=scroll]') || c.parentElement.parentElement
    const hr = host.getBoundingClientRect()
    return { x: Math.round(hr.x + 6), y: Math.round(r.y + r.height / 2), x2: Math.round(r.x + r.width), y2: Math.round(r.y + 4) }
  })()`)
  if (spot) {
    await s.mouse.move(spot.x, spot.y)
    await s.mouse.down(spot.x, spot.y)
    for (let i = 1; i <= 8; i++) {
      await s.mouse.move(spot.x + ((spot.x2 - spot.x) * i) / 8, spot.y + ((spot.y2 - spot.y) * i) / 8)
      await s.sleep(30)
    }
    await s.mouse.up(spot.x2, spot.y2)
    await s.sleep(250)
    out.marqueeSelected = await s.ev(`document.querySelectorAll('.card.selected').length`)
    await s.key('Escape', 'Escape', 27)
  }

  // 8. 悬停信息条 + 快捷评分
  const cHov = await s.center('.card', 0)
  await s.mouse.move(cHov.x, cHov.y)
  await s.sleep(350)
  out.hoverBar = await s.ev(`(() => {
    const card = document.querySelectorAll('.card')[0]
    const bar = card.querySelector('.hover-bar')
    if (!bar) return { visible: false }
    return { visible: bar.offsetParent !== null, stars: bar.querySelectorAll('.rate-star, [class*=star]').length, text: bar.textContent.trim().slice(0, 30) }
  })()`)
  // 点第 3 颗星评分
  const star = await s.ev(`(() => {
    const card = document.querySelectorAll('.card')[0]
    const bar = card.querySelector('.hover-bar')
    const stars = bar ? bar.querySelectorAll('[class*=star]') : []
    if (stars.length < 3) return null
    const r = stars[2].getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)
  if (star) {
    await s.click(star.x, star.y)
    await s.sleep(400)
    out.rateAfter = await s.ev(`(() => {
      const card = document.querySelectorAll('.card')[0]
      return card.querySelector('.card-rating')?.textContent ?? '(无评分显示)'
    })()`)
    // 再点同一颗星取消
    await s.mouse.move(cHov.x, cHov.y)
    await s.sleep(300)
    await s.click(star.x, star.y)
    await s.sleep(400)
    out.rateCleared = await s.ev(`(() => {
      const card = document.querySelectorAll('.card')[0]
      return card.querySelector('.card-rating')?.textContent ?? null
    })()`)
  }

  // 9. 双击进预览
  const cDbl = await s.center('.card', 1)
  await s.mouse.move(cDbl.x, cDbl.y)
  await s.mouse.down(cDbl.x, cDbl.y)
  await s.mouse.up(cDbl.x, cDbl.y)
  await s.mouse.down(cDbl.x, cDbl.y, { count: 2 })
  await s.mouse.up(cDbl.x, cDbl.y, { count: 2 })
  await s.sleep(500)
  out.dblclickPreview = await s.ev(`!!document.querySelector('.previewer')`)
  await s.key('Escape', 'Escape', 27)

  out.consoleErrors = s.errors
  console.log(JSON.stringify(out, null, 1))
  s.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
