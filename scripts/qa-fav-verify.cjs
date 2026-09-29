// 终验:类名数组断言(避免 includes('on') 匹配 icon 子串的假阳性)
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  await s.reload()
  await s.sleep(1800)
  await s.ev(`(() => { if(!document.querySelector('.details')){ const b=[...document.querySelectorAll('.toolbar button')].find(x=>/详情面板/.test(x.title)); b?.click(); } return true })()`)
  await s.sleep(300)
  await s.ev(`(() => { const cards=[...document.querySelectorAll('.card')]; const c=cards.find(x=>!x.querySelector('.kind-badge')); c?.click(); return !!c })()`)
  await s.sleep(1000)

  const cls = () => s.ev(`(() => [...document.querySelector('.details').querySelectorAll('button')].find(b=>/收藏/.test(b.title)).className.split(' ').filter(Boolean))()`)
  const clickFav = () => s.ev(`(() => { const b=[...document.querySelector('.details').querySelectorAll('button')].find(x=>/收藏/.test(x.title)); b.click(); return true })()`)

  const out = {}
  out.t0 = await cls()
  await clickFav()
  await s.sleep(1000)
  out.t1 = await cls()
  await clickFav()
  await s.sleep(1000)
  out.t2 = await cls()
  out.main = await s.ev(`(async () => { const n=document.querySelector('.details .file-name')?.textContent; const r=await window.mv.assets.list(); return r.assets.find(x=>x.fileName===n)?.favorite })()`, true)
  console.log(JSON.stringify({ 点击前: out.t0, 点击1次: out.t1, 点击2次: out.t2, 主进程: out.main }, null, 1))
  s.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
