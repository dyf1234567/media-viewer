// 批次4验证:批量导出(IPC 主链路 + UI 对话框) + 取色器实机
const { session } = require('./cdp.cjs')
const fs = require('fs')
const path = require('path')

const outDir = 'C:\\Users\\17839\\AppData\\Local\\Temp\\mv-export-test'

async function main() {
  const s = await session()
  const out = {}
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

  // 1. IPC:原样复制导出 2 张图
  out.copy = await s.ev(
    `window.mv.assets.list().then(r => { const imgs = r.assets.filter(a => a.kind === 'image' && !a.deletedAt).slice(0, 2).map(a => a.id); return window.mv.assets.exportBatch(imgs, { dir: ${JSON.stringify(outDir)}, mode: 'copy' }) })`,
    true
  )
  // 2. IPC:转换格式(webp)导出同 2 张
  out.convert = await s.ev(
    `window.mv.assets.list().then(r => { const imgs = r.assets.filter(a => a.kind === 'image' && !a.deletedAt).slice(0, 2).map(a => a.id); return window.mv.assets.exportBatch(imgs, { dir: ${JSON.stringify(outDir)}, mode: 'convert', format: 'webp', quality: 85 }) })`,
    true
  )
  out.files = fs.readdirSync(outDir)

  // 3. UI:批量条「导出…」对话框打开/aria/取消
  const c0 = await s.center('.card', 0)
  await s.click(c0.x, c0.y)
  await s.sleep(400)
  await s.ev(`(() => { const b=[...document.querySelectorAll('.batch-bar button')].find(x=>/导出/.test(x.textContent)); if(!b) return false; b.click(); return true })()`)
  await s.sleep(500)
  out.exportDialog = await s.ev(`(() => { const d=document.querySelector('.dlg[aria-label=批量导出]'); return d ? { open: true, role: d.getAttribute('role'), hasDirRow: d.textContent.includes('导出到'), hasMode: d.textContent.includes('原样复制') } : { open: false } })()`)
  await s.key('Escape', 'Escape', 27)
  await s.sleep(300)
  await s.key('Escape', 'Escape', 27)
  await s.sleep(300)

  // 4. 取色器:双图对比并排模式取色
  // 清托盘→加两张图→开工作台
  await s.ev(`(() => { const p=document.querySelector('.tray-pill'); if(p)p.click(); return true })()`)
  await s.sleep(300)
  await s.ev(`(() => { const p=document.querySelector('.tray-panel'); if(!p)return false; const b=[...p.querySelectorAll('button')].find(x=>/清空/.test(x.textContent)); b?.click(); return true })()`)
  await s.sleep(300)
  const idxs = await s.ev(`(() => { const cards=[...document.querySelectorAll('.card')]; const r=[]; for(let i=0;i<cards.length&&r.length<2;i++){ if(!cards[i].querySelector('.kind-badge')) r.push(i) } return r })()`)
  for (const i of idxs) {
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
    out.wb = await s.ev(`document.querySelector('.cw-title')?.textContent.trim()`)
    // 激活取色器并点击 pane 中心
    await s.ev(`(() => { const wb=document.querySelector('.cw-overlay'); if(!wb)return false; const b=[...wb.querySelectorAll('button')].find(x=>/取色/.test(x.title)); if(!b) return 'picker-btn-not-found'; b.click(); return true })()`)
    await s.sleep(400)
    const pane = await s.ev(`(() => { const wb=document.querySelector('.cw-overlay'); if(!wb)return null; const imgs=[...wb.querySelectorAll('.pane img')]; if(!imgs.length) return null; const r=imgs[0].getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)} })()`)
    if (pane) {
      await s.click(pane.x, pane.y)
      await s.sleep(700)
      out.pickToast = await s.ev(`(() => { const t=[...document.querySelectorAll('.toast, [class*=toast]')].map(x=>x.textContent.trim()).filter(t2=>/#[0-9A-F]{6}/.test(t2)); return t[0] || 'no-hex-toast' })()`)
    }
    await s.key('Escape', 'Escape', 27)
    await s.sleep(400)
  }

  // 5. 清理:导出目录 + 托盘
  fs.rmSync(outDir, { recursive: true, force: true })
  await s.ev(`(() => { const p=document.querySelector('.tray-pill'); if(p)p.click(); return true })()`)
  await s.sleep(300)
  await s.ev(`(() => { const p=document.querySelector('.tray-panel'); if(!p)return false; const b=[...p.querySelectorAll('button')].find(x=>/清空/.test(x.textContent)); b?.click(); return true })()`)

  out.errors = s.errors
  console.log(JSON.stringify(out, null, 1))
  s.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
