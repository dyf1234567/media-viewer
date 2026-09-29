// 检查重载后评分标记渲染 + byId 响应性
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  await s.reload()
  const out = {}
  out.afterReload = await s.ev(`(() => {
    const cards = [...document.querySelectorAll('.card')]
    const c = cards.find((x) => x.querySelector('.card-name')?.textContent === '测试视频-被测片.mp4')
    return {
      found: !!c,
      ratingSpan: c?.querySelector('.card-rating')?.textContent ?? null
    }
  })()`)

  // 主进程侧确认
  out.mainRating = await s.ev(
    `window.mv.assets.list().then(r => r.assets.find(a => a.fileName === '测试视频-被测片.mp4')?.rating)`,
    true
  )

  // 活更新链:程序化点星 → 300ms 后读视图(不重载)
  const card0 = await s.center('.card', 0)
  await s.mouse.move(card0.x, card0.y)
  await s.sleep(250)
  out.hitTop = await s.ev(`(() => {
    const stars = document.querySelectorAll('.card')[0].querySelectorAll('button.star')
    const r = stars[1].getBoundingClientRect()
    return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.tagName
  })()`)
  await s.ev(`document.querySelectorAll('.card')[0].querySelectorAll('button.star')[1].click(); true`)
  await s.sleep(400)
  out.spanAfterLiveClick = await s.ev(
    `document.querySelectorAll('.card')[0].querySelector('.card-rating')?.textContent ?? null`
  )
  // 清理:再点同一颗星取消
  await s.ev(`document.querySelectorAll('.card')[0].querySelectorAll('button.star')[1].click(); true`)
  await s.sleep(300)
  out.spanAfterClear = await s.ev(
    `document.querySelectorAll('.card')[0].querySelector('.card-rating')?.textContent ?? null`
  )
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
