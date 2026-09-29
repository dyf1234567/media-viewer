// 补测:开始分析 → 图表 → 悬停
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  await s.sleep(800)
  const out = {}

  for (let i = 0; i < 4 && !(await s.ev(`!!document.querySelector('.tray-panel')`)); i++) {
    await s.ev(`document.querySelector('.tray-pill')?.click(); true`)
    await s.sleep(450)
  }
  const openBtn = await s.ev(`(() => { const p=document.querySelector('.tray-panel'); if(!p)return null; const b=[...p.querySelectorAll('button')].find(x=>/打开对比/.test(x.textContent)); if(!b)return null; const r=b.getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)} })()`)
  await s.click(openBtn.x, openBtn.y)
  await s.sleep(1500)

  // 进质检 tab
  const tabBtn = await s.ev(`(() => { const wb=document.querySelector('.cw-overlay'); if(!wb)return null; const b=[...wb.querySelectorAll('button')].find(x=>x.title.includes('质检')); if(!b)return null; const r=b.getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)} })()`)
  await s.click(tabBtn.x, tabBtn.y)
  await s.sleep(800)

  // 点「开始分析」(精确匹配)
  const startBtn = await s.ev(`(() => { const wb=document.querySelector('.cw-overlay'); if(!wb)return null; const b=[...wb.querySelectorAll('button')].find(x=>x.textContent.trim()==='开始分析'); if(!b)return null; const r=b.getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)} })()`)
  out.startBtnFound = !!startBtn
  if (startBtn) {
    await s.click(startBtn.x, startBtn.y)
    let ok = false
    let busyText = ''
    for (let i = 0; i < 30 && !ok; i++) {
      await s.sleep(1000)
      ok = await s.ev(`!!document.querySelector('.qchart')`)
      if (!ok && i % 5 === 4) {
        busyText += (await s.ev(`document.querySelector('.cw-overlay')?.textContent.includes('分析中') ? '分析中 ' : '无图表 '`)) + `@${i + 1}s; `
      }
    }
    out.chartAppeared = ok
    out.busyTrace = busyText
    if (ok) {
      out.chartMetrics = await s.ev(`(() => { const wb=document.querySelector('.cw-overlay'); const t=wb.textContent; return { avg: (t.match(/平均[^\\s]{0,10}/g)||[]).slice(0,2), hasPsnr: t.includes('PSNR') } })()`)
      const cv = await s.ev(`(() => { const c=document.querySelector('.qchart'); const r=c.getBoundingClientRect(); return {x:Math.round(r.x+r.width*0.55),y:Math.round(r.y+r.height*0.5)} })()`)
      await s.mouse.move(cv.x, cv.y)
      await s.sleep(400)
      await s.mouse.move(cv.x + 70, cv.y - 8)
      await s.sleep(400)
      out.hoverNoCrash = await s.ev(`!!document.querySelector('.qchart')`)
      out.wbAlive = await s.ev(`!!document.querySelector('.cw-overlay')`)
    }
  }
  await s.key('Escape', 'Escape', 27)
  await s.sleep(400)
  out.errors = s.errors
  console.log(JSON.stringify(out, null, 1))
  s.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
