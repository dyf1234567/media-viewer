// smoke.cjs — 重载后基础冒烟
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  await s.reload()
  await s.sleep(1800)
  const cards = await s.ev(`document.querySelectorAll('.card').length`)
  const dims = await s.ev(`document.querySelectorAll('.filterbar .dim-btn').length`)
  const orb = await s.ev(`(() => { const o = document.querySelector('.bg-orbs .orb'); return o ? getComputedStyle(o).filter : 'none' })()`)
  console.log(`smoke: cards=${cards} dimBtns=${dims} orbFilter=${orb} errors=${s.errors.length}`)
  s.close()
  process.exit(s.errors.length ? 1 : 0)
}

main().catch((e) => {
  console.error('失败:', e.message)
  process.exit(1)
})
