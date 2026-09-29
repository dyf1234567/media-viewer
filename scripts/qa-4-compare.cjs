// 测试 4:右键菜单 → 对比托盘 → 对比工作台(模式切换/Esc)
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  await s.reload()
  const out = {}

  // 1. 右键第一张卡片
  const c0 = await s.center('.card', 0)
  await s.mouse.move(c0.x, c0.y)
  await s.mouse.down(c0.x, c0.y, { button: 'right' })
  await s.mouse.up(c0.x, c0.y, { button: 'right' })
  await s.sleep(400)
  out.ctxMenu = await s.ev(`(() => {
    const m = document.querySelector('.ctx-menu')
    return m ? { open: true, items: [...m.querySelectorAll('.menu-item, button, div[class*=item]')].map(x => x.textContent.trim()).filter(Boolean).slice(0, 6) } : { open: false }
  })()`)

  // 2. 点「加入对比」
  const addBtn = await s.ev(`(() => {
    const m = document.querySelector('.ctx-menu')
    if (!m) return null
    const items = [...m.querySelectorAll('*')].filter((x) => x.textContent.trim() === '加入对比' && x.children.length <= 2)
    const t = items[items.length - 1]
    if (!t) return null
    const r = t.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)
  out.addBtnFound = !!addBtn
  if (addBtn) {
    await s.click(addBtn.x, addBtn.y)
    await s.sleep(500)
  }

  // 3. 右键第二张卡片加入对比
  const c1 = await s.center('.card', 1)
  await s.mouse.move(c1.x, c1.y)
  await s.mouse.down(c1.x, c1.y, { button: 'right' })
  await s.mouse.up(c1.x, c1.y, { button: 'right' })
  await s.sleep(400)
  const addBtn2 = await s.ev(`(() => {
    const m = document.querySelector('.ctx-menu')
    if (!m) return null
    const items = [...m.querySelectorAll('*')].filter((x) => x.textContent.trim() === '加入对比' && x.children.length <= 2)
    const t = items[items.length - 1]
    if (!t) return null
    const r = t.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)
  if (addBtn2) {
    await s.click(addBtn2.x, addBtn2.y)
    await s.sleep(500)
  }

  // 4. 托盘状态
  out.tray = await s.ev(`(() => {
    const t = document.querySelector('.tray-pill')
    return t ? { pill: t.textContent.trim().slice(0, 20) } : null
  })()`)

  // 5. 展开托盘并点「打开工作台」类入口
  const pill = await s.ev(`(() => {
    const t = document.querySelector('.tray-pill')
    const r = t.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)
  await s.click(pill.x, pill.y)
  await s.sleep(500)
  out.trayPanel = await s.ev(`(() => {
    const p = document.querySelector('.tray-panel')
    if (!p) return { open: false }
    const btns = [...p.querySelectorAll('button')].map((b) => b.title || b.textContent.trim()).filter(Boolean)
    return { open: true, buttons: btns.slice(0, 10) }
  })()`)

  // 6. 打开工作台(找含 工作台/对比 字样的按钮)
  const wbBtn = await s.ev(`(() => {
    const p = document.querySelector('.tray-panel')
    if (!p) return null
    const b = [...p.querySelectorAll('button')].find((x) => /工作台|开始对比|打开对比/.test(x.title + x.textContent))
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)
  out.wbBtnFound = !!wbBtn
  if (wbBtn) {
    await s.click(wbBtn.x, wbBtn.y)
    await s.sleep(1200)
    out.workbench = await s.ev(`(() => {
      const wb = document.querySelector('.workbench, [class*=workbench], [class*=compare-wrap]')
      if (!wb) return { open: false }
      const btns = [...wb.querySelectorAll('button')].map((b) => b.title || b.textContent.trim()).filter(Boolean)
      return { open: true, buttons: btns.slice(0, 14) }
    })()`)
    // 模式按钮探测
    out.modeBtns = await s.ev(`(() => {
      const wb = document.querySelector('.workbench, [class*=workbench], [class*=compare-wrap]')
      if (!wb) return null
      return [...wb.querySelectorAll('button')].filter((b) => /并排|擦除|差异|闪烁|side|wipe|diff|flicker/i.test(b.title + b.textContent)).map((b) => b.title || b.textContent.trim())
    })()`)
    // Esc 关闭工作台
    await s.key('Escape', 'Escape', 27)
    await s.sleep(500)
    out.wbClosedByEsc = await s.ev(`!document.querySelector('.workbench, [class*=workbench]')`)
  }

  out.errors = s.errors
  console.log(JSON.stringify(out, null, 1))
  s.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
