// 加号工具栏验证:菜单结构 + 全部功能 + 单行布局
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  await s.reload()
  await s.sleep(1500)
  const out = {}

  // 1. 工具栏现状:一个加号 + 单行
  out.toolbar = await s.ev(`(() => {
    const t = document.querySelector('.toolbar')
    return {
      plusBtn: !!t.querySelector('.plus-btn'),
      textBtns: [...t.querySelectorAll('.btn')].map(b => b.textContent.trim()).filter(x => x && !x.includes('…')),
      height: Math.round(t.getBoundingClientRect().height),
      oneLine: t.getBoundingClientRect().height < 52
    }
  })()`)

  const openPlus = () =>
    s.ev(`(() => { const b=document.querySelector('.plus-btn'); if(!b) return false; b.click(); return true })()`)
  out.opened = await openPlus()
  await s.sleep(400)
  out.menu = await s.ev(`(() => {
    const ps = [...document.querySelectorAll('.popover')]
    const p = ps.find(x => /引用原文件/.test(x.textContent))
    if (!p) return { open: false }
    return {
      open: true,
      groups: [...p.querySelectorAll('.popover-label')].map(x => x.textContent),
      items: [...p.querySelectorAll('.popover-item')].map(i => i.textContent.trim().replace(/\\s+/g, ' ').slice(0, 22))
    }
  })()`)

  // 2. 查找相似
  await s.ev(`(() => { const ps=[...document.querySelectorAll('.popover')]; const p=ps.find(x=>/引用原文件/.test(x.textContent)); const it=[...p.querySelectorAll('.popover-item')].find(i=>/相似/.test(i.textContent)); it?.click(); return true })()`)
  await s.sleep(500)
  out.similarDlg = await s.ev(`!!document.querySelector('.dlg[aria-label=查找相似图片]')`)
  await s.key('Escape', 'Escape', 27)
  await s.sleep(300)

  // 3. 随机浏览进出
  await openPlus()
  await s.sleep(300)
  await s.ev(`(() => { const ps=[...document.querySelectorAll('.popover')]; const p=ps.find(x=>/引用原文件/.test(x.textContent)); const it=[...p.querySelectorAll('.popover-item')].find(i=>/随机浏览/.test(i.textContent)&&!/退出/.test(i.textContent)); it?.click(); return true })()`)
  await s.sleep(600)
  out.randomScope = await s.ev(`document.querySelector('.status-bar .scope-chip')?.textContent.trim()`)
  await openPlus()
  await s.sleep(300)
  out.exitShown = await s.ev(`(() => { const ps=[...document.querySelectorAll('.popover')]; const p=ps.find(x=>/退出随机/.test(x.textContent)); return !!p })()`)
  await s.ev(`(() => { const ps=[...document.querySelectorAll('.popover')]; const p=ps.find(x=>/退出随机/.test(x.textContent)); const it=[...p.querySelectorAll('.popover-item')].find(i=>/退出随机/.test(i.textContent)); it?.click(); return true })()`)
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
