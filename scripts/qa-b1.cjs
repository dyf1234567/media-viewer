// 批次 1 验证:? 速查面板 / 幻灯片轮播 / 图表悬停无异常
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  await s.sleep(1200)
  const out = {}

  // 1. ? 打开速查面板
  await s.key('?', 'Slash', 191, 1) // Shift+/ → modifiers:1(shift)? '?' 需要 shift;直接 key '?' code Slash vk 191
  await s.sleep(200)
  await s.key('?', 'Slash', 191, 8)
  await s.sleep(500)
  out.helpByQ = await s.ev(`(() => {
    const d = document.querySelector('.shortcut-dlg')
    if (!d) return { open: false }
    const rows = d.querySelectorAll('.sc-row').length
    const groups = [...d.querySelectorAll('.sc-title')].map((x) => x.textContent)
    return { open: true, role: d.getAttribute('role'), label: d.getAttribute('aria-label'), rows, groups }
  })()`)

  // 面板开着按方向键不应清选择/导航(mask stop 传播)
  await s.key('ArrowRight', 'ArrowRight', 39)
  await s.sleep(200)
  out.stillOpen = await s.ev(`!!document.querySelector('.shortcut-dlg')`)
  // Esc 关闭
  await s.key('Escape', 'Escape', 27)
  await s.sleep(300)
  out.closedByEsc = await s.ev(`!document.querySelector('.shortcut-dlg')`)

  // 2. 幻灯片轮播
  const c0 = await s.center('.card', 0)
  await s.click(c0.x, c0.y)
  await s.sleep(200)
  await s.key(' ', 'Space', 32)
  await s.sleep(700)
  const page = () =>
    s.ev(`(() => { const el=[...document.querySelectorAll('.previewer *')].find(x=>/^\\d+ \\/ \\d+$/.test(x.textContent.trim())); return el?el.textContent.trim():null })()`)
  out.slidePage0 = await page()
  const playBtn = await s.ev(`(() => {
    const b = [...document.querySelectorAll('.previewer button')].find((x) => /幻灯片/.test(x.title))
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)
  out.slideBtnFound = !!playBtn
  if (playBtn) {
    await s.click(playBtn.x, playBtn.y)
    await s.sleep(3600) // 3 秒轮播一档
    out.slidePage1 = await page()
    await s.sleep(3200)
    out.slidePage2 = await page()
    // 停止
    await s.click(playBtn.x, playBtn.y)
    await s.sleep(500)
    out.slideBtnState = await s.ev(`(() => { const b=[...document.querySelectorAll('.previewer button')].find(x=>/幻灯片/.test(x.title)); return b?b.className.includes('slide-on'):null })()`)
    const pBeforeStop = await page()
    await s.sleep(3400)
    out.stoppedAt = await page()
    out.stoppedWorks = pBeforeStop === out.stoppedAt
  }
  await s.key('Escape', 'Escape', 27)
  await s.sleep(300)

  // 3. 质量图表悬停(双视频对比 + 客观指标)
  // 托盘清空后加两个视频
  await s.ev(`(() => { const p=document.querySelector('.tray-pill'); if(p)p.click(); return true })()`)
  await s.sleep(300)
  await s.ev(`(() => { const p=document.querySelector('.tray-panel'); if(!p)return false; const b=[...p.querySelectorAll('button')].find(x=>/清空/.test(x.textContent)); if(b)b.click(); return true })()`)
  await s.sleep(300)
  const vIdxs = await s.ev(`(() => {
    const cards=[...document.querySelectorAll('.card')]
    const res=[]
    for(let i=0;i<cards.length&&res.length<2;i++){ if(cards[i].querySelector('.kind-badge')) res.push(i) }
    return res
  })()`)
  for (const i of vIdxs) {
    const c = await s.center('.card', i)
    await s.mouse.move(c.x, c.y)
    await s.mouse.down(c.x, c.y, { button: 'right' })
    await s.mouse.up(c.x, c.y, { button: 'right' })
    await s.sleep(350)
    await s.ev(`(() => { const m=document.querySelector('.ctx-menu'); if(!m)return false; const items=[...m.querySelectorAll('*')].filter(x=>x.textContent.trim()==='加入对比'&&x.children.length<=2); if(items.length)items[items.length-1].click(); return true })()`)
    await s.sleep(350)
  }
  for (let i = 0; i < 4 && !(await s.ev(`!!document.querySelector('.tray-panel')`)); i++) {
    await s.ev(`document.querySelector('.tray-pill')?.click(); true`)
    await s.sleep(450)
  }
  const openBtn = await s.ev(`(() => { const p=document.querySelector('.tray-panel'); if(!p)return null; const b=[...p.querySelectorAll('button')].find(x=>/打开对比/.test(x.textContent)); if(!b)return null; const r=b.getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)} })()`)
  if (openBtn) {
    await s.click(openBtn.x, openBtn.y)
    await s.sleep(1500)
    out.wbTitle = await s.ev(`document.querySelector('.cw-title')?.textContent.trim()`)
    // 点「客观指标」类按钮跑质量分析
    const metricBtn = await s.ev(`(() => {
      const wb=document.querySelector('.cw-overlay'); if(!wb)return null
      const b=[...wb.querySelectorAll('button')].find(x=>/客观指标|指标/.test(x.title+x.textContent))
      if(!b)return null
      const r=b.getBoundingClientRect()
      return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}
    })()`)
    out.metricBtnFound = !!metricBtn
    if (metricBtn) {
      await s.click(metricBtn.x, metricBtn.y)
      await s.sleep(9000) // PSNR/SSIM 分析需要时间
      out.chartExists = await s.ev(`!!document.querySelector('.qchart')`)
      if (out.chartExists) {
        // 悬停:移到图表中央附近,应无异常且 canvas 仍正常
        const cv = await s.ev(`(() => { const c=document.querySelector('.qchart'); const r=c.getBoundingClientRect(); return {x:Math.round(r.x+r.width*0.5),y:Math.round(r.y+r.height*0.5)} })()`)
        await s.mouse.move(cv.x, cv.y)
        await s.sleep(300)
        await s.mouse.move(cv.x + 60, cv.y - 10)
        await s.sleep(300)
        out.hoverNoCrash = await s.ev(`!!document.querySelector('.cw-overlay')`)
        await s.mouse.move(cv.x - 40, cv.y + 5)
        await s.sleep(200)
        await s.ev(`(() => { const c=document.querySelector('.qchart'); c?.dispatchEvent(new MouseEvent('mouseleave')); return true })()`)
        await s.sleep(200)
        out.afterLeave = await s.ev(`!!document.querySelector('.qchart')`)
      }
    }
    await s.key('Escape', 'Escape', 27)
    await s.sleep(400)
  }

  out.errors = s.errors
  console.log(JSON.stringify(out, null, 1))
  s.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
