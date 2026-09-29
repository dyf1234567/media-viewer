// 补验:follow 选项选中态 + 石墨预设隐藏光斑 + 保存持久化
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  const out = {}

  const lookBtn = await s.ev(`(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /外观/.test(x.title || x.textContent))
    const r = b.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)
  await s.click(lookBtn.x, lookBtn.y)
  await s.sleep(600)

  out.viewerSwatches = await s.ev(`(() => {
    const d = document.querySelector('.dlg[aria-label=外观与背景]')
    const secs = [...d.querySelectorAll('.sec-title')]
    const viewSec = secs.find((x) => x.textContent.includes('查看与对比背景'))
    const row = viewSec.nextElementSibling
    return [...row.querySelectorAll('.swatch')].map((x) => ({
      label: x.textContent.trim(),
      active: x.className.includes('active')
    }))
  })()`)

  // 点石墨(界面背景区第一个 sec 的 swatch)
  const graphite = await s.ev(`(() => {
    const d = document.querySelector('.dlg[aria-label=外观与背景]')
    const secs = [...d.querySelectorAll('.sec-title')]
    const row = secs[0].nextElementSibling
    const g = [...row.querySelectorAll('.swatch')].find((x) => x.textContent.trim() === '石墨')
    const r = g.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)
  await s.click(graphite.x, graphite.y)
  await s.sleep(500)
  out.graphite = await s.ev(`(() => {
    const o = document.querySelector('.bg-orbs .orb')
    return { uiBg: document.body.dataset.uiBg, orbOpacity: getComputedStyle(o).opacity }
  })()`)

  // 再点回渐变玻璃(aurora)确认光斑回归
  const aurora = await s.ev(`(() => {
    const d = document.querySelector('.dlg[aria-label=外观与背景]')
    const secs = [...d.querySelectorAll('.sec-title')]
    const row = secs[0].nextElementSibling
    const g = [...row.querySelectorAll('.swatch')].find((x) => x.textContent.trim() === '渐变玻璃')
    const r = g.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)
  await s.click(aurora.x, aurora.y)
  await s.sleep(400)
  out.auroraBack = await s.ev(`(() => {
    const o = document.querySelector('.bg-orbs .orb')
    return { uiBg: document.body.dataset.uiBg, orbOpacity: getComputedStyle(o).opacity }
  })()`)

  // 取消(不保存,还原)
  const cancelBtn = await s.ev(`(() => {
    const d = document.querySelector('.dlg[aria-label=外观与背景]')
    const b = [...d.querySelectorAll('button')].find((x) => x.textContent.trim() === '取消')
    const r = b.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)
  await s.click(cancelBtn.x, cancelBtn.y)
  await s.sleep(400)

  // 确认 follow 是持久值(主进程存的外观)
  out.savedAppearance = await s.ev(`window.mv.settings.get().then(r => r.appearance)`, true)
  out.errors = s.errors
  console.log(JSON.stringify(out, null, 1))
  s.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
