// 综合验证:详情面板评分/收藏实时刷新 + 筛选漏斗收纳
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  await s.reload()
  await s.sleep(1500)
  const out = {}

  // 展开详情面板 + 选中第一张图片卡
  await s.ev(`(() => { if(!document.querySelector('.details')){ const b=[...document.querySelectorAll('.toolbar button')].find(x=>/详情面板/.test(x.title)); b?.click(); } return true })()`)
  await s.sleep(400)
  await s.ev(`(() => { const cards=[...document.querySelectorAll('.card')]; const c=cards.find(x=>!x.querySelector('.kind-badge')); c?.click(); return !!c })()`)
  await s.sleep(1000)

  // ---- 1. 评分修复 ----
  out.rateBefore = await s.ev(`document.querySelectorAll('.details .stars button.star.on').length`)
  await s.ev(`(() => { document.querySelector('.details').querySelectorAll('.stars button.star')[3].click(); return true })()`)
  await s.sleep(1200)
  out.rateAfterClick4 = await s.ev(`document.querySelectorAll('.details .stars button.star.on').length`)
  out.rateMain = await s.ev(`(async () => { const n=document.querySelector('.details .file-name')?.textContent; const r=await window.mv.assets.list(); return r.assets.find(x=>x.fileName===n)?.rating })()`, true)
  // 悬停条同步(同卡)
  out.rateHover = await s.ev(`(() => { const cards=[...document.querySelectorAll('.card')]; const c=cards.find(x=>x.querySelector('.card-name')?.textContent===document.querySelector('.details .file-name')?.textContent); return c?.querySelectorAll('.hover-bar .star.on').length ?? 'no' })()`)

  // ---- 2. 收藏修复 ----
  out.favBefore = await s.ev(`(() => { const b=[...document.querySelector('.details').querySelectorAll('button')].find(x=>/收藏/.test(x.title)); return b.className.includes('on') })()`)
  await s.ev(`(() => { const b=[...document.querySelector('.details').querySelectorAll('button')].find(x=>/收藏/.test(x.title)); b.click(); return true })()`)
  await s.sleep(1000)
  out.favAfter = await s.ev(`(() => { const b=[...document.querySelector('.details').querySelectorAll('button')].find(x=>/收藏/.test(x.title)); return b.className.includes('on') })()`)

  // 还原收藏
  await s.ev(`(() => { const b=[...document.querySelector('.details').querySelectorAll('button')].find(x=>/收藏/.test(x.title)); b.click(); return true })()`)
  await s.sleep(600)

  // ---- 3. 筛选收纳 ----
  out.filterDefault = await s.ev(`!!document.querySelector('.filterbar')`)
  out.funnelBtn = await s.ev(`(() => { const b=document.querySelector('.filter-toggle'); return b ? { found: true, badge: b.querySelector('.filter-badge')?.textContent ?? null } : { found: false } })()`)
  await s.ev(`document.querySelector('.filter-toggle')?.click()`)
  await s.sleep(400)
  out.afterFunnel = await s.ev(`(() => ({ filterbar: !!document.querySelector('.filterbar'), dimRow: !!document.querySelector('.dim-row'), active: document.querySelector('.filter-toggle')?.className.includes('active') }))()`)
  // 选 PNG 筛选
  await s.ev(`(() => { const b=[...document.querySelectorAll('.dim-btn')].find(x=>/格式/.test(x.textContent)); b?.click(); return true })()`)
  await s.sleep(400)
  await s.ev(`(() => { const p=document.querySelector('.popover'); if(!p)return false; const it=[...p.querySelectorAll('.popover-item')].find(x=>/PNG/.test(x.textContent)); it?.click(); return true })()`)
  await s.sleep(600)
  out.afterFilter = await s.ev(`(() => ({ chips: [...document.querySelectorAll('.chip')].map(c=>c.textContent.trim().slice(0,14)), badge: document.querySelector('.filter-toggle .filter-badge')?.textContent ?? null, cards: document.querySelectorAll('.card').length }))()`)
  // 收起漏斗:chips 保留
  await s.ev(`document.querySelector('.filter-toggle')?.click()`)
  await s.sleep(400)
  out.afterCollapse = await s.ev(`(() => ({ filterbar: !!document.querySelector('.filterbar'), dimRow: !!document.querySelector('.dim-row'), chips: document.querySelectorAll('.chip').length }))()`)
  // 清空全部 → filterbar 消失
  await s.ev(`(() => { const c=[...document.querySelectorAll('.chip')].find(x=>/清空全部/.test(x.textContent)); c?.click(); return true })()`)
  await s.sleep(500)
  out.afterClear = await s.ev(`(() => ({ filterbar: !!document.querySelector('.filterbar'), badge: document.querySelector('.filter-toggle .filter-badge')?.textContent ?? null, cards: document.querySelectorAll('.card').length }))()`)

  out.errors = s.errors.slice(0, 3)
  console.log(JSON.stringify(out, null, 1))
  s.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
