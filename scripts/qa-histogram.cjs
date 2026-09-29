// 直方图自动加载修复验证:选中即出现,无需点击
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  await s.reload()
  await s.sleep(1500)
  const out = {}

  // canvas 绘制检测:空白画布 toDataURL 很短,画过则 >2KB
  const canvasDrawn = () =>
    s.ev(`(() => { const c = document.querySelector('.hist-canvas'); if (!c) return 'no-canvas'; try { return c.toDataURL().length } catch { return 'err' } })()`)

  // 1. 点第一张卡(模拟用户选中,不点直方图任何东西)
  const c0 = await s.center('.card', 0)
  await s.click(c0.x, c0.y)
  await s.sleep(1200)
  out.firstSel = await canvasDrawn()

  // 2. 切到另一张(走 assetId watch 路径)
  const c2 = await s.center('.card', 2)
  await s.click(c2.x, c2.y)
  await s.sleep(1200)
  out.secondSel = await canvasDrawn()

  // 3. 切换通道(mode watch 路径,应立即换色重绘)
  await s.ev(`(() => { const t=[...document.querySelectorAll('.hist-box .mode-tab')].find(x=>x.textContent.trim()==='R'); t?.click(); return true })()`)
  await s.sleep(400)
  out.afterModeSwitch = await canvasDrawn()

  out.errors = s.errors.length
  console.log(JSON.stringify(out, null, 1))
  s.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
