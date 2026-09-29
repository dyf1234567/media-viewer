// 复现实验:打开双图对比是否写源文件(用从未参与对比的 小红图 + 照片jpg副本)
const { session } = require('./cdp.cjs')
const fs = require('fs')
const path = 'C:\\Users\\17839\\Pictures\\MV-测试素材\\'

async function stat() {
  return {
    小红图: fs.statSync(path + '小红图.png').mtimeMs,
    照片副本: fs.statSync(path + '照片jpg副本.jpg').mtimeMs,
    size1: fs.statSync(path + '小红图.png').size,
    size2: fs.statSync(path + '照片jpg副本.jpg').size
  }
}

async function main() {
  const s = await session()
  await s.reload()
  const out = {}
  out.before = await stat()

  // 搜索定位两张图 → 右键加入对比
  const search = await s.ev(`(() => { const i = document.querySelector('input[placeholder*=搜索]'); const r = i.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } })()`)
  for (const name of ['小红图', '照片jpg']) {
    await s.click(search.x, search.y)
    await s.sleep(150)
    await s.ev(`(() => { const i = document.querySelector('input[placeholder*=搜索]'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
    await s.sleep(200)
    await s.send('Input.insertText', { text: name })
    await s.sleep(500)
    const c = await s.center('.card', 0)
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
  out.afterTray = await stat()

  // 展开托盘 → 打开对比
  for (let i = 0; i < 4 && !(await s.ev(`!!document.querySelector('.tray-panel')`)); i++) {
    await s.ev(`document.querySelector('.tray-pill')?.click(); true`)
    await s.sleep(450)
  }
  const openBtn = await s.ev(`(() => {
    const p = document.querySelector('.tray-panel')
    const b = [...p.querySelectorAll('button')].find((x) => /打开对比/.test(x.textContent))
    const r = b.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)
  await s.click(openBtn.x, openBtn.y)
  await s.sleep(2000)
  out.afterOpen = await stat()
  out.title = await s.ev(`document.querySelector('.cw-title')?.textContent.trim()`)

  // 逐个动作检查:切并排/擦除/差异/闪烁
  const modes = ['并排', '擦除', '差异', '闪烁']
  for (const m of modes) {
    const btn = await s.ev(`(() => {
      const wb = document.querySelector('.cw-overlay')
      if (!wb) return null
      const b = [...wb.querySelectorAll('button')].find((x) => (x.textContent.trim().includes(${JSON.stringify(m)}) || (x.title || '').includes(${JSON.stringify(m)})) && !/同步|框选/.test(x.textContent + x.title))
      if (!b) return null
      const r = b.getBoundingClientRect()
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
    })()`)
    if (btn) {
      await s.click(btn.x, btn.y)
      await s.sleep(1500)
      out['after_' + m] = await stat()
    }
  }
  await s.key('Escape', 'Escape', 27)
  await s.sleep(300)
  out.afterClose = await stat()
  out.errors = s.errors
  console.log(JSON.stringify(out, null, 1))
  s.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
