// 终极诊断:watch 日志 + 按钮HTML + full值三对照
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  await s.reload()
  await s.sleep(1500)
  await s.ev(`(() => { if(!document.querySelector('.details')){ const b=[...document.querySelectorAll('.toolbar button')].find(x=>/详情面板/.test(x.title)); b?.click(); } return true })()`)
  await s.sleep(300)
  await s.ev(`(() => { const cards=[...document.querySelectorAll('.card')]; const c=cards.find(x=>!x.querySelector('.kind-badge')); c?.click(); return !!c })()`)
  await s.sleep(1000)

  const state = () =>
    s.ev(`(() => {
      const p = document.querySelector('.details')
      const fav = [...p.querySelectorAll('button')].find(b => /收藏/.test(b.title))
      return { name: p.querySelector('.file-name')?.textContent, cls: fav?.className, filled: p.querySelectorAll('.stars button.star.on').length }
    })()`)

  const out = {}
  out.t0 = await state()
  await s.ev(`(() => { const b=[...document.querySelector('.details').querySelectorAll('button')].find(x=>/收藏/.test(x.title)); b.click(); return true })()`)
  await s.sleep(1500)
  out.t1500 = await state()
  out.logs = s.errors.filter((e) => e.kind === 'console.warning').map((e) => e.text.slice(0, 80)).slice(0, 8)
  console.log(JSON.stringify(out, null, 1))
  s.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
