// 测试 4c:双图对比四模式(并排/擦除/差异/闪烁)
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  await s.reload()
  const out = {}

  // 清空托盘(若上次遗留),然后加两张图片卡
  await s.ev(`(() => { const p = document.querySelector('.tray-pill'); if (p) p.click(); return true })()`)
  await s.sleep(300)
  await s.ev(`(() => {
    const p = document.querySelector('.tray-panel')
    if (!p) return 'no-panel'
    const b = [...p.querySelectorAll('button')].find((x) => /清空/.test(x.textContent))
    if (b) b.click()
    return 'cleared'
  })()`)
  await s.sleep(300)

  // 右键两张非视频卡加入对比
  const idxs = await s.ev(`(() => {
    const cards = [...document.querySelectorAll('.card')]
    const res = []
    for (let i = 0; i < cards.length && res.length < 2; i++) {
      if (!cards[i].querySelector('.kind-badge')) res.push(i)
    }
    return res
  })()`)
  for (const i of idxs) {
    const c = await s.center('.card', i)
    await s.mouse.move(c.x, c.y)
    await s.mouse.down(c.x, c.y, { button: 'right' })
    await s.mouse.up(c.x, c.y, { button: 'right' })
    await s.sleep(350)
    await s.ev(`(() => {
      const m = document.querySelector('.ctx-menu')
      if (!m) return false
      const items = [...m.querySelectorAll('*')].filter((x) => x.textContent.trim() === '加入对比' && x.children.length <= 2)
      if (items.length) items[items.length - 1].click()
      return true
    })()`)
    await s.sleep(350)
  }
  out.tray = await s.ev(`document.querySelector('.tray-pill')?.textContent.trim()`)

  // 展开托盘(带重试:pill 在计数变化后有位移动画)
  let opened = false
  for (let i = 0; i < 4 && !opened; i++) {
    await s.ev(`document.querySelector('.tray-pill')?.click(); true`)
    await s.sleep(450)
    opened = await s.ev(`!!document.querySelector('.tray-panel')`)
  }
  if (!opened) {
    console.log(JSON.stringify({ fail: '面板未展开', trayText: await s.ev(`document.querySelector('.tray-pill')?.textContent.trim() ?? null`) }))
    s.close()
    return
  }
  const openBtn = await s.ev(`(() => {
    const p = document.querySelector('.tray-panel')
    if (!p) return null
    const b = [...p.querySelectorAll('button')].find((x) => /打开对比/.test(x.textContent))
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)
  if (!openBtn) {
    console.log(JSON.stringify({ fail: '打开对比按钮未找到', trayText: await s.ev(`document.querySelector('.tray-pill')?.textContent.trim() ?? null`) }))
    s.close()
    return
  }
  await s.click(openBtn.x, openBtn.y)
  await s.sleep(1500)
  out.title = await s.ev(`document.querySelector('.cw-title')?.textContent.trim()`)
  out.open = await s.ev(`!!document.querySelector('.cw-overlay')`)

  // 四模式切换
  out.modes = []
  for (const m of ['并排', '擦除', '差异', '闪烁']) {
    const btn = await s.ev(`(() => {
      const wb = document.querySelector('.cw-overlay')
      if (!wb) return null
      const b = [...wb.querySelectorAll('button')].find((x) => (x.textContent.trim().includes(${JSON.stringify(m)}) || (x.title || '').includes(${JSON.stringify(m)})) && !/同步|框选/.test(x.textContent + x.title))
      if (!b) return null
      const r = b.getBoundingClientRect()
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
    })()`)
    if (!btn) {
      out.modes.push(m + ':not-found')
      continue
    }
    await s.click(btn.x, btn.y)
    await s.sleep(900)
    const st = await s.ev(`(() => {
      const wb = document.querySelector('.cw-overlay')
      if (!wb) return 'closed'
      const active = [...wb.querySelectorAll('button')].find((b) => (b.title || b.textContent).includes(${JSON.stringify(m)}) && !/同步|框选/.test(b.textContent + b.title))
      return { imgs: wb.querySelectorAll('img').length, activeClass: active ? active.className : null }
    })()`)
    out.modes.push(m + ':' + JSON.stringify(st))
  }

  await s.key('Escape', 'Escape', 27)
  await s.sleep(400)
  out.closed = await s.ev(`!document.querySelector('.cw-overlay')`)
  out.errors = s.errors
  console.log(JSON.stringify(out, null, 1))
  s.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
