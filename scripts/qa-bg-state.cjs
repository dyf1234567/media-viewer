// 查询当前背景外观状态
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  const r = await s.ev(`(() => ({
    uiBg: document.body.dataset.uiBg || '(未设置)',
    bodyColor: getComputedStyle(document.body).backgroundColor,
    bgImage: (getComputedStyle(document.body).backgroundImage || 'none').slice(0, 70),
    lsKeys: Object.keys(localStorage)
      .filter((k) => /appear|bg|theme|viewer|ui/i.test(k))
      .map((k) => k + ' = ' + String(localStorage.getItem(k)).slice(0, 90))
  }))()`)
  console.log(JSON.stringify(r, null, 1))
  s.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
