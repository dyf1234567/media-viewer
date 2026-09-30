// debug-ctx.cjs — 右键菜单空白点击失效排查
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  await s.reload()
  await s.sleep(1500)
  const card = await s.center('.card')
  await s.click(card.x, card.y, { button: 'right' })
  await s.sleep(300)
  const info = await s.ev(`(() => {
    const menu = document.querySelector('.ctx-menu')
    const backdrop = document.querySelector('.popover-backdrop')
    const mr = menu ? menu.getBoundingClientRect() : null
    return {
      menu: !!menu,
      menuRect: mr ? { x: Math.round(mr.x), y: Math.round(mr.y), w: Math.round(mr.width), h: Math.round(mr.height) } : null,
      backdrop: !!backdrop,
      backdropZ: backdrop ? getComputedStyle(backdrop).zIndex : '',
      innerH: window.innerHeight,
      innerW: window.innerWidth
    }
  })()`)
  console.log('状态:', JSON.stringify(info))
  const probe = await s.ev(`(() => {
    const el = document.elementFromPoint(80, window.innerHeight - 60)
    return el ? el.className || el.tagName : 'null'
  })()`)
  console.log('elementFromPoint(80, h-60):', JSON.stringify(probe))
  s.close()
}

main().catch((e) => {
  console.error('失败:', e.message)
  process.exit(1)
})
