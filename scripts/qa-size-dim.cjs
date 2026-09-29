// 验证大小维度(打印全部 popover 原文)
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  await s.ev(`(() => { const b=[...document.querySelectorAll('.dim-btn')].find(x=>/更多筛选/.test(x.textContent)); b?.click(); return true })()`)
  await s.sleep(400)
  await s.ev(`(() => { const ps=[...document.querySelectorAll('.popover')]; const p=ps.find(x=>x.querySelector('.popover-item')); const it=[...p.querySelectorAll('.popover-item')].find(i=>/大小/.test(i.textContent)); it?.click(); return true })()`)
  await s.sleep(600)
  const pops = await s.ev(`(() => [...document.querySelectorAll('.popover')].map(p => ({ items: [...p.querySelectorAll('.popover-item')].map(i => i.textContent.trim()).slice(0, 6), label: p.querySelector('.popover-label')?.textContent ?? null })))()`)
  console.log(JSON.stringify(pops, null, 1))
  await s.key('Escape', 'Escape', 27)
  await s.sleep(200)
  await s.key('Escape', 'Escape', 27)
  s.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
