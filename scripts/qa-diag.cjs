// 诊断:CDP 修饰键是否生效 / 星星点击落点
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()

  // 1. 捕获真实鼠标事件的修饰键状态
  await s.ev(`window.__dbg = []; document.addEventListener('mousedown', e => window.__dbg.push({ t: 'md', ctrl: e.ctrlKey, shift: e.shiftKey, cls: (e.target.className||'').toString().slice(0,20) }), true); document.addEventListener('click', e => window.__dbg.push({ t: 'click', ctrl: e.ctrlKey, shift: e.shiftKey, cls: (e.target.className||'').toString().slice(0,20) }), true); true`)

  const c3 = await s.center('.card', 3)
  await s.click(c3.x, c3.y, { modifiers: 2 })
  await s.sleep(200)
  const dbg1 = await s.ev(`window.__dbg`)
  const selCount = await s.ev(`document.querySelectorAll('.card.selected').length`)

  // 2. 星星落点:elementFromPoint
  const card0 = await s.center('.card', 0)
  await s.mouse.move(card0.x, card0.y)
  await s.sleep(300)
  const starInfo = await s.ev(`(() => {
    const card = document.querySelectorAll('.card')[0]
    const bar = card.querySelector('.hover-bar')
    const stars = bar.querySelectorAll('button.star')
    const r = stars[2].getBoundingClientRect()
    const hit = document.elementFromPoint(r.x + r.width/2, r.y + r.height/2)
    return {
      starCount: stars.length,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      hitAtPoint: hit ? hit.tagName + '.' + (hit.className || '').toString().slice(0, 30) : null,
      barVisible: bar.offsetParent !== null,
      barOpacity: getComputedStyle(bar).opacity
    }
  })()`)

  // 3. 直接 DOM click 星星(绕过坐标),验证逻辑链路
  await s.ev(`document.querySelectorAll('.card')[0].querySelector('button.star:nth-child(3)').click(); true`)
  await s.sleep(500)
  const ratingDom = await s.ev(`(() => {
    const card = document.querySelectorAll('.card')[0]
    return card.querySelector('.card-rating')?.textContent ?? null
  })()`)

  // 4. 坐标点击星星(走真实事件)
  const r2 = await s.ev(`(() => {
    const stars = document.querySelectorAll('.card')[0].querySelectorAll('button.star')
    const r = stars[2].getBoundingClientRect()
    return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }
  })()`)
  await s.mouse.move(r2.x, r2.y)
  await s.sleep(250)
  await s.mouse.down(r2.x, r2.y)
  await s.mouse.up(r2.x, r2.y)
  await s.sleep(500)
  const ratingCoord = await s.ev(`document.querySelectorAll('.card')[0].querySelector('.card-rating')?.textContent ?? null`)

  console.log(JSON.stringify({ dbg1, selCount, starInfo, ratingDom, ratingCoord, errors: s.errors }, null, 1))
  s.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
