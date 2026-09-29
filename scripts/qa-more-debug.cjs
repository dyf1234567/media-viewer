// 调试:更多筛选 → 维度选项弹层
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  const out = {}
  await s.ev(`(() => { const b=[...document.querySelectorAll('.dim-btn')].find(x=>/更多筛选/.test(x.textContent)); b?.click(); return !!b })()`)
  await s.sleep(400)
  out.moreOpen = await s.ev(`!!document.querySelector('.popover')`)
  // 点"标签"项
  await s.ev(`(() => { const ps=[...document.querySelectorAll('.popover')]; const p=ps.find(x=>x.querySelector('.popover-item')); const it=[...p.querySelectorAll('.popover-item')].find(i=>/标签/.test(i.textContent)); it?.click(); return true })()`)
  await s.sleep(150)
  out.fast = await s.ev(`(() => [...document.querySelectorAll('.popover')].map(p => p.textContent.slice(0, 26).replace(/\\s+/g, ' ')))()`)
  await s.sleep(600)
  out.slow = await s.ev(`(() => [...document.querySelectorAll('.popover')].map(p => p.textContent.slice(0, 26).replace(/\\s+/g, ' ')))()`)
  out.backdrop = await s.ev(`!!document.querySelector('.popover-backdrop')`)
  console.log(JSON.stringify(out, null, 1))
  await s.key('Escape', 'Escape', 27)
  s.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
