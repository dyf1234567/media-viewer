// 干净重载验证收藏 true→false 方向(先确保库中为 true)
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  await s.reload()
  await s.sleep(1800)

  // 展开面板选中卡
  await s.ev(`(() => { if(!document.querySelector('.details')){ const b=[...document.querySelectorAll('.toolbar button')].find(x=>/详情面板/.test(x.title)); b?.click(); } return true })()`)
  await s.sleep(300)
  await s.ev(`(() => { const cards=[...document.querySelectorAll('.card')]; const c=cards.find(x=>!x.querySelector('.kind-badge')); c?.click(); return !!c })()`)
  await s.sleep(1000)

  // 若库中 false 先置 true(通过 API),再 reload 缓存
  const cur = await s.ev(`(async () => { const n=document.querySelector('.details .file-name')?.textContent; const r=await window.mv.assets.list(); const a=r.assets.find(x=>x.fileName===n); if(a && !a.favorite){ await window.mv.assets.update(a.id,{favorite:true}); return 'set-true' } return a?.favorite })()`, true)
  if (cur === 'set-true') {
    await s.reload()
    await s.sleep(1800)
    await s.ev(`(() => { if(!document.querySelector('.details')){ const b=[...document.querySelectorAll('.toolbar button')].find(x=>/详情面板/.test(x.title)); b?.click(); } return true })()`)
    await s.sleep(300)
    await s.ev(`(() => { const cards=[...document.querySelectorAll('.card')]; const c=cards.find(x=>!x.querySelector('.kind-badge')); c?.click(); return !!c })()`)
    await s.sleep(1000)
  }

  const out = { setup: cur }
  const st = () =>
    s.ev(`(() => { const p=document.querySelector('.details'); const f=[...p.querySelectorAll('button')].find(b=>/收藏/.test(b.title)); return { ui: f.className.includes('on'), heart: f.querySelector('svg')?.getAttribute('fill') } })()`)
  out.before = await st()
  await s.ev(`(() => { const b=[...document.querySelector('.details').querySelectorAll('button')].find(x=>/收藏/.test(x.title)); b.click(); return true })()`)
  await s.sleep(300)
  out.mid = await st()
  await s.sleep(1200)
  out.after = await st()
  out.main = await s.ev(`(async () => { const n=document.querySelector('.details .file-name')?.textContent; const r=await window.mv.assets.list(); return r.assets.find(x=>x.fileName===n)?.favorite })()`, true)
  out.syncLogs = s.errors.filter((e) => e.text.includes('[sync]')).length
  console.log(JSON.stringify(out, null, 1))
  s.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
