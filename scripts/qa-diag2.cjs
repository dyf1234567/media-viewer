// 诊断 2:悬停条 hit-test 层级 + 评分调用链
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  const out = {}

  const card0 = await s.center('.card', 0)
  await s.mouse.move(card0.x, card0.y)
  await s.sleep(350)

  // 1. 星星位置的所有命中元素(按层级从上到下)
  out.hitChain = await s.ev(`(() => {
    const stars = document.querySelectorAll('.card')[0].querySelectorAll('button.star')
    const r = stars[2].getBoundingClientRect()
    const chain = document.elementsFromPoint(r.x + r.width/2, r.y + r.height/2)
    return chain.slice(0, 6).map(e => e.tagName + '.' + (typeof e.className === 'string' ? e.className : '').slice(0, 26))
  })()`)

  // 2. 相关元素的关键样式
  out.styles = await s.ev(`(() => {
    const g = (el) => { const c = getComputedStyle(el); return { pe: c.pointerEvents, z: c.zIndex, pos: c.position } }
    const card = document.querySelectorAll('.card')[0]
    return {
      card: g(card),
      bar: g(card.querySelector('.hover-bar')),
      star: g(card.querySelectorAll('button.star')[2]),
      thumbBox: g(card.querySelector('.thumb-box')),
      img: g(card.querySelector('img.thumb'))
    }
  })()`)

  // 3. 包一层 assets.update,看 quickRate 是否被触发
  await s.ev(`(() => {
    const orig = window.mv.assets.update.bind(window.mv.assets)
    window.__upd = null
    window.mv.assets.update = (...a) => { window.__upd = a; return orig(...a) }
    return true
  })()`)

  // 4. DOM 直接点星星
  await s.ev(`document.querySelectorAll('.card')[0].querySelectorAll('button.star')[2].click(); true`)
  await s.sleep(600)
  out.updateCalled = await s.ev(`window.__upd ? JSON.parse(JSON.stringify(window.__upd)) : null`)
  out.ratingSpan = await s.ev(`document.querySelectorAll('.card')[0].querySelector('.card-rating')?.textContent ?? null`)

  // 5. 悬停条上的收藏按钮(同类穿透?)
  out.favBtn = await s.ev(`(() => {
    const btn = document.querySelectorAll('.card')[0].querySelector('.hover-bar .fav-btn')
    if (!btn) return { exists: false }
    const r = btn.getBoundingClientRect()
    const hit = document.elementFromPoint(r.x + r.width/2, r.y + r.height/2)
    return { exists: true, hit: hit ? hit.tagName + '.' + (typeof hit.className === 'string' ? hit.className : '').slice(0, 24) : null }
  })()`)

  out.errors = s.errors
  console.log(JSON.stringify(out, null, 1))
  s.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
