// 测试 4b:工作台(.cw-overlay)模式切换与关闭
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  const out = {}
  // 托盘里已有 2 个(上一轮加的)
  const pill = await s.ev(`(() => {
    const t = document.querySelector('.tray-pill')
    if (!t) return null
    const r = t.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), text: t.textContent.trim() }
  })()`)
  out.trayPill = pill?.text ?? null
  if (!pill) {
    console.log(JSON.stringify({ skip: '托盘不存在' }))
    s.close()
    return
  }
  await s.click(pill.x, pill.y)
  await s.sleep(400)
  // 若面板未展开(上轮遗留已展开,再点变收起),补点一次
  let panelOpen = await s.ev(`!!document.querySelector('.tray-panel')`)
  if (!panelOpen) {
    await s.click(pill.x, pill.y)
    await s.sleep(400)
    panelOpen = await s.ev(`!!document.querySelector('.tray-panel')`)
  }
  out.trayPanelOpen = panelOpen
  const openBtn = await s.ev(`(() => {
    const p = document.querySelector('.tray-panel')
    if (!p) return null
    const b = [...p.querySelectorAll('button')].find((x) => /打开对比/.test(x.title + x.textContent))
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)
  if (!openBtn) {
    console.log(JSON.stringify({ fail: '打开对比按钮未找到', out }))
    s.close()
    return
  }
  await s.click(openBtn.x, openBtn.y)
  await s.sleep(1500)
  out.workbenchOpen = await s.ev(`!!document.querySelector('.cw-overlay')`)
  out.headInfo = await s.ev(`document.querySelector('.cw-title')?.textContent.trim()`)
  out.buttons = await s.ev(`(() => {
    const wb = document.querySelector('.cw-overlay')
    if (!wb) return null
    return [...wb.querySelectorAll('button')].map((b) => b.title || b.textContent.trim()).filter(Boolean).slice(0, 16)
  })()`)

  // 模式切换(并排→擦除→差异→闪烁)
  const modes = ['并排', '擦除', '差异', '闪烁']
  out.modeSwitch = []
  for (const m of modes) {
    const btn = await s.ev(`(() => {
      const wb = document.querySelector('.cw-overlay')
      if (!wb) return null
      const b = [...wb.querySelectorAll('button')].find((x) => x.textContent.trim().includes(${JSON.stringify(m)}) || (x.title || '').includes(${JSON.stringify(m)}))
      if (!b) return null
      const r = b.getBoundingClientRect()
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
    })()`)
    if (!btn) {
      out.modeSwitch.push(m + ':btn-not-found')
      continue
    }
    await s.click(btn.x, btn.y)
    await s.sleep(700)
    const ok = await s.ev(`(() => {
      const wb = document.querySelector('.cw-overlay')
      return wb ? { open: true, imgs: wb.querySelectorAll('img').length, canvases: wb.querySelectorAll('canvas').length } : { open: false }
    })()`)
    out.modeSwitch.push(m + ':' + JSON.stringify(ok))
  }

  // Esc 关闭
  await s.key('Escape', 'Escape', 27)
  await s.sleep(500)
  out.closedByEsc = await s.ev(`!document.querySelector('.cw-overlay')`)

  out.errors = s.errors
  console.log(JSON.stringify(out, null, 1))
  s.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
