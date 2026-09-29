// 复现:右键选中后无法取消
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  await s.sleep(1500)
  const out = {}
  const selCount = () => s.ev(`document.querySelectorAll('.card.selected').length`)

  // 1. 右键一张卡(应选中并弹菜单)
  const c0 = await s.center('.card', 0)
  await s.mouse.move(c0.x, c0.y)
  await s.mouse.down(c0.x, c0.y, { button: 'right' })
  await s.mouse.up(c0.x, c0.y, { button: 'right' })
  await s.sleep(400)
  out.afterRightClick = { selected: await selCount(), menuOpen: await s.ev(`!!document.querySelector('.ctx-menu')`) }

  // 点菜单外空白关闭菜单
  await s.click(300, 200)
  await s.sleep(400)
  out.afterCloseMenu = { selected: await selCount(), menuOpen: await s.ev(`!!document.querySelector('.ctx-menu')`) }

  // 2. 点空白区域(应清空选择——单击空白取消)
  const spot = await s.ev(`(() => { const c=document.querySelector('.card'); const host=c.closest('.grid-container'); const hr=host.getBoundingClientRect(); return { x: Math.round(hr.x + 8), y: Math.round(hr.bottom - 8) } })()`)
  await s.click(spot.x, spot.y)
  await s.sleep(400)
  out.afterBlankClick = await selCount()

  // 3. Esc 取消
  await s.key('Escape', 'Escape', 27)
  await s.sleep(300)
  out.afterEsc = await selCount()

  // 4. 左键另一张卡 → 再点卡片外空白(卡片间空隙)
  const c1 = await s.center('.card', 1)
  await s.click(c1.x, c1.y)
  await s.sleep(300)
  out.afterLeftClick = await selCount()

  console.log(JSON.stringify(out, null, 1))
  s.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
