// 工具栏减负验证:一行布局 + 更多菜单三项功能
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  await s.sleep(1500)
  const out = {}

  // 1. 工具栏按钮与行数
  out.toolbar = await s.ev(`(() => {
    const t = document.querySelector('.toolbar')
    const btns = [...t.querySelectorAll(':scope > .tb-group > .btn')].map(b => b.textContent.trim())
    return { buttons: btns, height: Math.round(t.getBoundingClientRect().height), oneLine: t.getBoundingClientRect().height < 52 }
  })()`)

  // 2. 打开更多菜单
  const openMore = () =>
    s.ev(`(() => { const b=[...document.querySelectorAll('.toolbar .btn')].find(x=>/更多/.test(x.textContent)); if(!b) return false; b.click(); return true })()`)
  await openMore()
  await s.sleep(400)
  out.moreMenu = await s.ev(`(() => {
    const ps = [...document.querySelectorAll('.popover')]
    const p = ps.find(x => /随机浏览/.test(x.textContent))
    return p ? { open: true, items: [...p.querySelectorAll('.popover-item')].map(i => i.textContent.trim()) } : { open: false }
  })()`)

  // 3. 查找相似
  await s.ev(`(() => { const ps=[...document.querySelectorAll('.popover')]; const p=ps.find(x=>/随机浏览/.test(x.textContent)); const it=[...p.querySelectorAll('.popover-item')].find(i=>/相似/.test(i.textContent)); it?.click(); return true })()`)
  await s.sleep(500)
  out.similarDlg = await s.ev(`!!document.querySelector('.dlg[aria-label=查找相似图片]')`)
  await s.key('Escape', 'Escape', 27)
  await s.sleep(300)

  // 4. 随机浏览
  await openMore()
  await s.sleep(300)
  await s.ev(`(() => { const ps=[...document.querySelectorAll('.popover')]; const p=ps.find(x=>/随机浏览/.test(x.textContent)); const it=[...p.querySelectorAll('.popover-item')].find(i=>/随机浏览/.test(i.textContent)&&!/退出/.test(i.textContent)); it?.click(); return true })()`)
  await s.sleep(600)
  out.randomScope = await s.ev(`document.querySelector('.status-bar .scope-chip')?.textContent.trim()`)

  // 5. 退出随机
  await openMore()
  await s.sleep(300)
  out.exitItem = await s.ev(`(() => { const ps=[...document.querySelectorAll('.popover')]; const p=ps.find(x=>/退出随机/.test(x.textContent)); if(!p)return false; const it=[...p.querySelectorAll('.popover-item')].find(i=>/退出随机/.test(i.textContent)); it?.click(); return true })()`)
  await s.sleep(500)
  out.backToAll = await s.ev(`document.querySelector('.status-bar .scope-chip')?.textContent.trim()`)

  out.errors = s.errors.length
  console.log(JSON.stringify(out, null, 1))
  s.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
