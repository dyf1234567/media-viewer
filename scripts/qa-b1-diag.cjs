// 诊断:轮播停止 + 质量图表流程
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  await s.sleep(800)
  const out = {}

  // --- 轮播停止 ---
  const c0 = await s.center('.card', 0)
  await s.click(c0.x, c0.y)
  await s.sleep(200)
  await s.key(' ', 'Space', 32)
  await s.sleep(700)
  const page = () =>
    s.ev(`(() => { const el=[...document.querySelectorAll('.previewer *')].find(x=>/^\\d+ \\/ \\d+$/.test(x.textContent.trim())); return el?el.textContent.trim():null })()`)
  const btnPos = () =>
    s.ev(`(() => { const b=[...document.querySelectorAll('.previewer button')].find(x=>/幻灯片/.test(x.title)); if(!b) return null; const r=b.getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),on:b.className.includes('slide-on'),title:b.title} })()`)
  let b = await btnPos()
  await s.click(b.x, b.y)
  await s.sleep(300)
  b = await btnPos()
  out.afterStart = b
  await s.sleep(3300)
  out.pageWhileRunning = await page()
  b = await btnPos()
  await s.click(b.x, b.y)
  await s.sleep(300)
  b = await btnPos()
  out.afterStop = b
  await s.sleep(3500)
  out.pageAfterStopWait = await page()
  out.stopWorks = out.afterStop && !out.afterStop.on && out.pageWhileRunning !== out.pageAfterStopWait ? false : !out.afterStop?.on
  await s.key('Escape', 'Escape', 27)
  await s.sleep(300)

  // --- 质量分析流程 ---
  for (let i = 0; i < 4 && !(await s.ev(`!!document.querySelector('.tray-panel')`)); i++) {
    await s.ev(`document.querySelector('.tray-pill')?.click(); true`)
    await s.sleep(450)
  }
  const openBtn = await s.ev(`(() => { const p=document.querySelector('.tray-panel'); if(!p)return null; const b=[...p.querySelectorAll('button')].find(x=>/打开对比/.test(x.textContent)); if(!b)return null; const r=b.getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)} })()`)
  await s.click(openBtn.x, openBtn.y)
  await s.sleep(1500)
  // 列出工作台所有按钮和当前模式,看质量分析的入口形态
  out.wbButtons = await s.ev(`(() => {
    const wb=document.querySelector('.cw-overlay'); if(!wb) return null
    return [...wb.querySelectorAll('button')].map(b=>({t:(b.title||b.textContent.trim()).slice(0,24),on:b.className.includes('active')})).slice(0,18)
  })()`)
  out.wbText = await s.ev(`document.querySelector('.cw-overlay')?.textContent.slice(0,200)`)

  // 点「超分/插帧质检」模式的 tab
  const tabBtn = await s.ev(`(() => {
    const wb=document.querySelector('.cw-overlay'); if(!wb)return null
    const b=[...wb.querySelectorAll('button')].find(x=>/质检|逐帧/.test(x.title+x.textContent))
    if(!b)return null
    const r=b.getBoundingClientRect()
    return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}
  })()`)
  out.tabBtnFound = !!tabBtn
  if (tabBtn) {
    await s.click(tabBtn.x, tabBtn.y)
    await s.sleep(1000)
    out.afterTab = await s.ev(`(() => {
      const wb=document.querySelector('.cw-overlay'); if(!wb) return 'closed'
      return [...wb.querySelectorAll('button')].map(b=>(b.title||b.textContent.trim()).slice(0,22)).slice(0,20)
    })()`)
    // 找「开始分析」类按钮
    const analyzeBtn = await s.ev(`(() => {
      const wb=document.querySelector('.cw-overlay'); if(!wb)return null
      const b=[...wb.querySelectorAll('button')].find(x=>/分析|PSNR|SSIM|指标/.test(x.title+x.textContent))
      if(!b)return null
      const r=b.getBoundingClientRect()
      return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),t:(b.title||b.textContent).slice(0,20)}
    })()`)
    out.analyzeBtn = analyzeBtn ? analyzeBtn.t : null
    if (analyzeBtn) {
      await s.click(analyzeBtn.x, analyzeBtn.y)
      // 轮询等图表出现,最多 25s
      let ok = false
      for (let i = 0; i < 25 && !ok; i++) {
        await s.sleep(1000)
        ok = await s.ev(`!!document.querySelector('.qchart')`)
      }
      out.chartAppeared = ok
      if (ok) {
        const cv = await s.ev(`(() => { const c=document.querySelector('.qchart'); const r=c.getBoundingClientRect(); return {x:Math.round(r.x+r.width*0.6),y:Math.round(r.y+r.height*0.5)} })()`)
        await s.mouse.move(cv.x, cv.y)
        await s.sleep(400)
        await s.mouse.move(cv.x + 80, cv.y)
        await s.sleep(400)
        out.hoverOk = await s.ev(`!!document.querySelector('.cw-overlay')`)
      }
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
