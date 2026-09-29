// 测试 3:搜索 / 筛选 / 排序 / 视图切换 / 详情面板(重命名+标签) / 设置与外观对话框
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  await s.reload()
  const out = {}
  const count = () => s.ev(`document.querySelectorAll('.card, .row').length`)

  // ---- 搜索 ----
  const search = await s.ev(`(() => {
    const i = document.querySelector('input[placeholder*=搜索]')
    if (!i) return null
    const r = i.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)
  out.searchFound = !!search
  if (search) {
    await s.click(search.x, search.y)
    await s.sleep(200)
    await s.send('Input.insertText', { text: 'A1111' })
    await s.sleep(600)
    out.searchCount = await count()
    out.searchName = await s.ev(`document.querySelector('.card-name, .row .name-cell')?.textContent`)
    // 清空搜索
    await s.key('a', 'KeyA', 65, 2)
    await s.send('Input.insertText', { text: '' })
    // insertText 空串可能无效,直接改值
    await s.ev(`(() => { const i = document.querySelector('input[placeholder*=搜索]'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
    await s.sleep(500)
    out.countAfterClear = await count()
  }

  // ---- 视图切换:瀑布流 ↔ 列表 ----
  const listBtn = await s.ev(`(() => {
    const btns = [...document.querySelectorAll('button')]
    const b = btns.find((x) => x.className.includes('active') === false && x.querySelector('.icon') && x.getBoundingClientRect().width < 40 && /列表|list/i.test(x.title || x.textContent) === false)
    return null
  })()`)
  // 用精确选择器:视图切换按钮带 title
  const viewBtn = await s.ev(`(() => {
    const btns = [...document.querySelectorAll('button')]
    const b = btns.find((x) => /列表/.test(x.title || ''))
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)
  out.viewBtnFound = !!viewBtn
  if (viewBtn) {
    await s.click(viewBtn.x, viewBtn.y)
    await s.sleep(500)
    out.isList = await s.ev(`document.querySelectorAll('.row').length > 0`)
    out.listRows = await s.ev(`document.querySelectorAll('.row').length`)
    const wfBtn = await s.ev(`(() => {
      const btns = [...document.querySelectorAll('button')]
      const b = btns.find((x) => /瀑布|网格|waterfall|卡片/.test(x.title || ''))
      if (!b) return null
      const r = b.getBoundingClientRect()
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
    })()`)
    if (wfBtn) {
      await s.click(wfBtn.x, wfBtn.y)
      await s.sleep(400)
    }
  }
  out.cardsAfterViewBack = await count()

  // ---- 排序 ----
  const sortBtn = await s.ev(`(() => {
    const btns = [...document.querySelectorAll('button')]
    const b = btns.find((x) => /排序/.test(x.title || '') || /排序/.test(x.textContent))
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), label: x2(b) }
    function x2(el) { return (el.title || el.textContent.trim()).slice(0, 12) }
  })()`)
  out.sortBtn = sortBtn ? sortBtn.label : null
  if (sortBtn) {
    await s.click(sortBtn.x, sortBtn.y)
    await s.sleep(400)
    out.sortMenuItems = await s.ev(`(() => {
      const items = [...document.querySelectorAll('.menu-item, [class*=menu] [class*=item], .popover-item')]
      return items.map((x) => x.textContent.trim()).filter(Boolean).slice(0, 8)
    })()`)
    // 选「按名称」如果有
    const nameItem = await s.ev(`(() => {
      const items = [...document.querySelectorAll('.menu-item, .popover-item')]
      const t = items.find((x) => /名称/.test(x.textContent))
      if (!t) return null
      const r = t.getBoundingClientRect()
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
    })()`)
    if (nameItem) {
      await s.click(nameItem.x, nameItem.y)
      await s.sleep(500)
      out.firstNameAfterSort = await s.ev(`document.querySelector('.card-name')?.textContent`)
    }
  }

  // ---- 详情面板:重命名 + 标签 ----
  const c0 = await s.center('.card', 0)
  await s.click(c0.x, c0.y)
  await s.sleep(500)
  out.detailsName = await s.ev(`(() => {
    const panel = document.querySelector('.details, [class*=details]')
    return panel?.textContent.slice(0, 60)
  })()`)
  const renameBtn = await s.ev(`(() => {
    const btns = [...document.querySelectorAll('.details button, [class*=details] button, aside button')]
    const b = btns.find((x) => /重命名/.test(x.title || x.textContent))
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)
  out.renameBtnFound = !!renameBtn
  if (renameBtn) {
    await s.click(renameBtn.x, renameBtn.y)
    await s.sleep(400)
    out.renameInput = await s.ev(`(() => {
      const i = document.querySelector('.details input[type=text], aside input[type=text]')
      return i ? i.value : null
    })()`)
    // 改名:全选输入新名
    const inp = await s.ev(`(() => {
      const i = document.querySelector('.details input[type=text], aside input[type=text]')
      const r = i.getBoundingClientRect()
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
    })()`)
    await s.click(inp.x, inp.y)
    await s.key('a', 'KeyA', 65, 2)
    await s.send('Input.insertText', { text: '改名测试-QA' })
    await s.sleep(200)
    await s.key('Enter', 'Enter', 13)
    await s.sleep(900)
    out.nameAfterRename = await s.ev(`document.querySelectorAll('.card-name')[0]?.textContent`)
  }

  // ---- 设置 / 外观对话框 ----
  const settingsBtn = await s.ev(`(() => {
    const btns = [...document.querySelectorAll('button')]
    const b = btns.find((x) => /设置/.test(x.title || x.textContent))
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)
  out.settingsBtnFound = !!settingsBtn
  if (settingsBtn) {
    await s.click(settingsBtn.x, settingsBtn.y)
    await s.sleep(600)
    out.settingsDialog = await s.ev(`(() => {
      const d = document.querySelector('.dlg[role=dialog][aria-label=图库设置]')
      return d ? { open: true, libRow: d.textContent.includes('库位置'), keepDays: d.textContent.includes('保留') } : { open: false }
    })()`)
    // Tab 焦点循环
    await s.key('Tab', 'Tab', 9)
    await s.sleep(150)
    out.tabFocusInDialog = await s.ev(`!!document.querySelector('.dlg-mask').contains(document.activeElement)`)
    // Esc 关闭
    await s.key('Escape', 'Escape', 27)
    await s.sleep(300)
    out.settingsClosedByEsc = await s.ev(`!document.querySelector('.dlg-mask')`)
  }

  out.errors = s.errors
  console.log(JSON.stringify(out, null, 1))
  s.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
