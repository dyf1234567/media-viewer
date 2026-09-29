// 评分显示验证(正确断言:悬停条 star.on 填充数)+ 详情面板联动
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  const out = {}
  const card0 = await s.center('.card', 0)
  await s.mouse.move(card0.x, card0.y)
  await s.sleep(300)

  const stars = async () =>
    s.ev(`document.querySelectorAll('.card')[0].querySelectorAll('.hover-bar .star.on').length`)

  out.filledBefore = await stars()

  // 点第 3 颗星(坐标点击,走真实事件)
  const p = await s.ev(`(() => {
    const b = document.querySelectorAll('.card')[0].querySelectorAll('button.star')[2]
    const r = b.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)
  await s.click(p.x, p.y)
  await s.sleep(450)
  out.filledAfterRate = await stars()

  // 再点同颗星取消
  await s.click(p.x, p.y)
  await s.sleep(450)
  out.filledAfterClear = await stars()

  // 收藏按钮(悬停条右侧)
  const fav = await s.ev(`(() => {
    const b = document.querySelectorAll('.card')[0].querySelector('.hover-bar .fav-btn')
    const r = b.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), on: b.classList.contains('on') }
  })()`)
  await s.click(fav.x, fav.y)
  await s.sleep(450)
  out.favAfter = await s.ev(
    `document.querySelectorAll('.card')[0].querySelector('.hover-bar .fav-btn')?.classList.contains('on')`
  )
  out.favBadgeInList = await s.ev(`document.querySelector('.fav-inline') ? 'heart-visible' : 'none'`)
  // 还原收藏
  await s.click(fav.x, fav.y)
  await s.sleep(400)

  // 视频角标可见性(修复的另一项)
  out.videoBadge = await s.ev(`(() => {
    const cards = [...document.querySelectorAll('.card')]
    const c = cards.find((x) => x.querySelector('.card-name')?.textContent === '测试视频-被测片.mp4')
    const b = c?.querySelector('.kind-badge')
    if (!b) return { exists: false }
    const r = b.getBoundingClientRect()
    const chain = document.elementsFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    // badge pointer-events:none,跳过它后顶层应是图片(说明 badge 之下没有遮挡问题)
    return { exists: true, text: b.textContent.trim(), chainTop: chain.slice(0, 3).map((e) => e.tagName).join('>') }
  })()`)

  out.ratingFinal = await s.ev(
    `window.mv.assets.list().then(r => r.assets.find(a => a.fileName === '测试视频-被测片.mp4')?.rating)`,
    true
  )
  out.errors = s.errors
  console.log(JSON.stringify(out, null, 1))
  s.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
