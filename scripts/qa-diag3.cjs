// 诊断 3:评分链路分段定位(DOM→IPC→store→视图)
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  const out = {}

  const card0 = await s.center('.card', 0)
  await s.mouse.move(card0.x, card0.y)
  await s.sleep(300)

  // 卡片 0 的文件名 → 从主进程数据找到 id 与评分
  out.card0Name = await s.ev(`document.querySelectorAll('.card')[0].querySelector('.card-name')?.textContent`)
  const id = await s.ev(`window.mv.assets.list().then(r => r.assets.find(a => a.fileName === ${JSON.stringify(out.card0Name)})?.id ?? null)`, true)
  out.assetId = id
  out.ratingBefore = await s.ev(`window.mv.assets.get(${id}).then(a => a.rating)`, true)

  // 1. 程序化点第 3 颗星 → 主进程侧评分变化?
  await s.ev(`document.querySelectorAll('.card')[0].querySelectorAll('button.star')[2].click(); true`)
  await s.sleep(600)
  out.ratingAfterStarClick = await s.ev(`window.mv.assets.get(${id}).then(a => a.rating)`, true)

  // 2. 直接调 IPC 更新评分 → 视图卡片是否出现 ★ 标记(测 store→DOM 响应链)
  await s.ev(`window.mv.assets.update(${id}, { rating: 4 }).then(() => true)`, true)
  await s.sleep(600)
  out.ratingSpanAfterDirect = await s.ev(`document.querySelectorAll('.card')[0].querySelector('.card-rating')?.textContent ?? null`)
  out.ratingAfterDirect = await s.ev(`window.mv.assets.get(${id}).then(a => a.rating)`, true)

  // 3. 还原
  await s.ev(`window.mv.assets.update(${id}, { rating: 0 }).then(() => true)`, true)
  await s.sleep(400)

  out.errors = s.errors
  console.log(JSON.stringify(out, null, 1))
  s.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
