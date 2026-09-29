// 批次2验证:文案完整性扫描 + 浅色主题切换 + 功能冒烟
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  await s.sleep(1500)
  const out = {}

  // 1. 全 UI 文案可疑模式扫描(中文旁突兀问号/FFFD/双问号)
  out.suspect = await s.ev(`(() => {
    const text = document.body.innerText
    const bad = []
    // 中文后紧跟 ? 再跟非问号标点/文字(吞字痕迹)
    const re1 = /[\\u4e00-\\u9fff]\\?[^\\?\\s]/g
    const re2 = /\\?\\?/g
    const re3 = /[\\uFFFD]/
    const m1 = text.match(re1) || []
    const m2 = text.match(re2) || []
    return { m1: m1.slice(0, 12), m2: m2.slice(0, 6), fffd: re3.test(text) }
  })()`)

  // 2. 深色基线
  out.dark = await s.ev(`(() => ({
    theme: document.documentElement.dataset.uiTheme,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    textColor: getComputedStyle(document.body).color,
    orbOpacity: getComputedStyle(document.querySelector('.bg-orbs .orb')).opacity,
    viewerBg: getComputedStyle(document.documentElement).getPropertyValue('--viewer-bg').trim()
  }))()`)

  // 3. 打开外观切浅色(全部 DOM click,避免坐标时序问题)
  const openLook = () => s.ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>/外观/.test(x.title||x.textContent)); if(!b)return false; b.click(); return true })()`)
  const dlgOpen = () => s.ev(`!!document.querySelector('.dlg[aria-label=外观与背景]')`)
  let guard = 0
  while (!(await dlgOpen()) && guard++ < 3) {
    await openLook()
    await s.sleep(500)
  }
  out.lookDialog = await dlgOpen()
  const clickSwatch = (label) =>
    s.ev(`(() => { const d=document.querySelector('.dlg[aria-label=外观与背景]'); if(!d)return false; const b=[...d.querySelectorAll('button')].find(x=>x.textContent.trim()==='${label}'); if(!b)return false; b.click(); return true })()`)
  out.lightClicked = await clickSwatch('浅色')
  await s.sleep(600)
  out.light = await s.ev(`(() => ({
    theme: document.documentElement.dataset.uiTheme,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    textColor: getComputedStyle(document.body).color,
    panelColor: getComputedStyle(document.querySelector('.sidebar, .nav-list') || document.body).backgroundColor,
    orbOpacity: getComputedStyle(document.querySelector('.bg-orbs .orb')).opacity,
    viewerBg: getComputedStyle(document.documentElement).getPropertyValue('--viewer-bg').trim(),
    navItemColor: (document.querySelector('.nav-item') ? getComputedStyle(document.querySelector('.nav-item')) : getComputedStyle(document.body)).color
  }))()`)

  // 4. 保存浅色
  await clickSwatch('保存')
  await s.sleep(600)
  out.saved = await s.ev(`window.mv.settings.get().then(r => r.appearance.uiTheme)`, true)

  // 5. 浅色下功能冒烟:筛选弹层 + 批量条
  await s.ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>/格式|筛选/.test(x.title+x.textContent)); b?.click(); return true })()`)
  await s.sleep(400)
  out.filterPop = await s.ev(`(() => { const p=document.querySelector('.popover'); return p ? { open: true, sample: p.textContent.slice(0, 40) } : { open: false } })()`)
  await s.key('Escape', 'Escape', 27)
  await s.sleep(300)
  // 选中一卡看批量条文案
  const c0 = await s.center('.card', 0)
  await s.click(c0.x, c0.y)
  await s.sleep(400)
  out.batchBar = await s.ev(`(() => { const b=document.querySelector('.batch-bar'); return b ? b.textContent.trim().slice(0, 60) : null })()`)
  await s.key('Escape', 'Escape', 27)

  // 6. 切回深色(还原)
  let g2 = 0
  while (!(await dlgOpen()) && g2++ < 3) {
    await openLook()
    await s.sleep(500)
  }
  await clickSwatch('深色')
  await s.sleep(400)
  await clickSwatch('保存')
  await s.sleep(500)
  out.restoredTheme = await s.ev(`document.documentElement.dataset.uiTheme`)

  out.errors = s.errors
  console.log(JSON.stringify(out, null, 1))
  s.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
