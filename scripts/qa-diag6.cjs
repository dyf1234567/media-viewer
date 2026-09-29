// 诊断:托盘面板展开失败的落点
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  const out = {}
  out.state = await s.ev(`(() => {
    const tray = document.querySelector('.tray')
    const pill = document.querySelector('.tray-pill')
    if (!tray) return { tray: 'missing' }
    const r = pill.getBoundingClientRect()
    const chain = document.elementsFromPoint(r.x + r.width / 2, r.y + r.height / 2).slice(0, 4).map((e) => e.tagName + '.' + (typeof e.className === 'string' ? e.className : '').slice(0, 20))
    return {
      trayClass: tray.className,
      pillRect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      hitChain: chain,
      panelInDom: !!document.querySelector('.tray-panel')
    }
  })()`)

  // DOM click 展开
  await s.ev(`document.querySelector('.tray-pill')?.click(); true`)
  await s.sleep(400)
  out.panelAfterDomClick = await s.ev(`!!document.querySelector('.tray-panel')`)
  // 收起还原
  await s.ev(`document.querySelector('.tray-pill')?.click(); true`)
  await s.sleep(200)

  // 坐标点击展开
  const p = await s.ev(`(() => { const t = document.querySelector('.tray-pill'); const r = t.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } })()`)
  await s.click(p.x, p.y)
  await s.sleep(400)
  out.panelAfterCoordClick = await s.ev(`!!document.querySelector('.tray-panel')`)
  out.errors = s.errors
  console.log(JSON.stringify(out, null, 1))
  s.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
