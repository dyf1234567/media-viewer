// 收藏调试:带日志复测
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  await s.sleep(1200)
  await s.ev(`(() => { if(!document.querySelector('.details')){ const b=[...document.querySelectorAll('.toolbar button')].find(x=>/详情面板/.test(x.title)); b?.click(); } return true })()`)
  await s.sleep(300)
  await s.ev(`(() => { const cards=[...document.querySelectorAll('.card')]; const c=cards.find(x=>!x.querySelector('.kind-badge')); c?.click(); return !!c })()`)
  await s.sleep(1000)

  const before = await s.ev(`(() => document.querySelector('.details .icon-btn')?.className ?? '?')()`)
  await s.ev(`(() => { const b=[...document.querySelector('.details').querySelectorAll('button')].find(x=>/收藏/.test(x.title)); b.click(); return true })()`)
  await s.sleep(1500)
  const after = await s.ev(`(() => document.querySelector('.details .icon-btn')?.className ?? '?')()`)
  const mainFav = await s.ev(`(async () => { const n=document.querySelector('.details .file-name')?.textContent; const r=await window.mv.assets.list(); return r.assets.find(x=>x.fileName===n)?.favorite })()`, true)

  console.log('ui before:', before)
  console.log('ui after:', after)
  console.log('main fav:', mainFav)
  console.log('debug logs:', JSON.stringify(s.errors.filter((e) => e.kind === 'console.warning').slice(0, 6), null, 1))
  s.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
