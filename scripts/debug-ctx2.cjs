// debug-ctx2.cjs — 检查 backdrop 元素的属性与计算样式
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  await s.reload()
  await s.sleep(1500)
  const card = await s.center('.card')
  await s.click(card.x, card.y, { button: 'right' })
  await s.sleep(300)
  const info = await s.ev(`(() => {
    const b = document.querySelector('.popover-backdrop')
    if (!b) return { exists: false }
    const cs = getComputedStyle(b)
    return {
      exists: true,
      attrs: [...b.attributes].map((a) => a.name).join(' '),
      position: cs.position,
      zIndex: cs.zIndex,
      inset: cs.top + ' ' + cs.left,
      parent: b.parentElement.tagName,
      rect: (() => { const r = b.getBoundingClientRect(); return [r.width, r.height] })()
    }
  })()`)
  console.log(JSON.stringify(info, null, 2))
  s.close()
}

main().catch((e) => {
  console.error('失败:', e.message)
  process.exit(1)
})
