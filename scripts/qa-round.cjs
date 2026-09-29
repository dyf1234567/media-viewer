// 本轮综合回归:右键菜单/角标动画/筛选新形态/预览器工具栏/过渡
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  await s.reload()
  await s.sleep(1800)
  const out = {}

  // ---- 1. 卡片角标与动画 ----
  out.badge = await s.ev(`(() => {
    const card = document.querySelector('.card')
    const b = card.querySelector('.check-badge')
    const cs = getComputedStyle(b)
    const cardCs = getComputedStyle(card)
    return {
      exists: !!b,
      transform: cs.transform,
      transition: cs.transition.split('cubic')[0].trim().slice(0, 24),
      cardTransition: cardCs.transition.split(',')[0].trim()
    }
  })()`)
  const c0 = await s.center('.card', 0)
  await s.click(c0.x, c0.y)
  await s.sleep(400)
  out.badgeSelected = await s.ev(`(() => { const b=document.querySelector('.card.selected .check-badge'); return b? getComputedStyle(b).transform.slice(0, 24) : 'no' })()`)
  await s.key('Escape', 'Escape', 27)

  // ---- 2. 右键菜单新项 ----
  const c1 = await s.center('.card', 1)
  await s.mouse.move(c1.x, c1.y)
  await s.mouse.down(c1.x, c1.y, { button: 'right' })
  await s.mouse.up(c1.x, c1.y, { button: 'right' })
  await s.sleep(400)
  out.ctxMenu = await s.ev(`(() => { const m=document.querySelector('.ctx-menu'); return m?{items:[...m.querySelectorAll('.popover-item')].map(i=>i.textContent.trim()).slice(0,9), sep:!!m.querySelector('.popover-sep')}:{open:false} })()`)
  // 菜单开着时点卡片:只关菜单不选中
  await s.click(c0.x, c0.y)
  await s.sleep(300)
  out.ctxClickThrough = await s.ev(`(() => ({ menuClosed: !document.querySelector('.ctx-menu'), selected: document.querySelectorAll('.card.selected').length }))()`)
  // 再点一次空白清选
  await s.click(c0.x, c0.y)
  await s.sleep(300)
  out.afterSecondClick = await s.ev(`document.querySelectorAll('.card.selected').length`)

  // ---- 3. 筛选新形态 ----
  out.filterBar = await s.ev(`(() => {
    const fb = document.querySelector('.filterbar')
    if (!fb) return { exists: false }
    const btns = [...fb.querySelectorAll('.dim-row > .dim-btn')].map(b => b.textContent.trim().replace('更多筛选', ''))
    return { exists: true, common: btns.filter(Boolean), hasMore: fb.textContent.includes('更多筛选') }
  })()`)
  // 打开更多筛选
  await s.ev(`(() => { const b=[...document.querySelectorAll('.dim-btn')].find(x=>/更多筛选/.test(x.textContent)); b?.click(); return !!b })()`)
  await s.sleep(400)
  out.moreList = await s.ev(`(() => { const ps=[...document.querySelectorAll('.popover')]; const p=ps.find(x=>/更多筛选/.test(x.textContent)&&x.querySelector('.popover-item')); return p?{open:true,items:[...p.querySelectorAll('.popover-item')].map(i=>i.textContent.trim())}:{open:false} })()`)
  // 从更多里打开一个维度(标签)
  await s.ev(`(() => { const ps=[...document.querySelectorAll('.popover')]; const p=ps.find(x=>/更多筛选/.test(x.textContent)&&x.querySelector('.popover-item')); const it=[...p.querySelectorAll('.popover-item')].find(i=>/标签/.test(i.textContent)); it?.click(); return true })()`)
  await s.sleep(400)
  out.dimFromMore = await s.ev(`(() => { const ps=[...document.querySelectorAll('.popover')]; const p=ps.find(x=>x.querySelector('.popover-item')&&!/更多筛选/.test(x.textContent)); return p?{open:true,label:p.querySelector('.popover-label')?.textContent}: {open:false} })()`)
  await s.key('Escape', 'Escape', 27)
  await s.sleep(300)

  // ---- 4. 预览器单工具栏 ----
  const c2 = await s.center('.card', 2)
  await s.click(c2.x, c2.y)
  await s.sleep(250)
  await s.key(' ', 'Space', 32)
  await s.sleep(800)
  out.viewer = await s.ev(`(() => {
    const p = document.querySelector('.previewer')
    if (!p) return { open: false }
    const tb = p.querySelector('.top-bar')
    return {
      open: true,
      singleToolbar: !!tb && tb.querySelectorAll('.pb-btn').length >= 8,
      noBottomBar: !p.querySelector('.bottom-bar') || p.querySelector('.bottom-bar')?.children.length === 0,
      hasBack: !!tb.querySelector('button[title*=返回]'),
      hasZoom: !!tb.querySelector('.zoom-pct')
    }
  })()`)
  await s.key('Escape', 'Escape', 27)
  await s.sleep(300)

  // ---- 5. 视图淡入 ----
  out.viewFade = await s.ev(`(() => { const el=document.querySelector('.wf-canvas'); return el? getComputedStyle(el).animationName : 'no' })()`)

  out.errors = s.errors.slice(0, 4)
  console.log(JSON.stringify(out, null, 1))
  s.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
