// 验证:动态光斑 + 查看背景跟随界面
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  await s.sleep(1500)
  const out = {}

  // 1. 光斑层存在且动画运行
  out.orbs = await s.ev(`(() => {
    const orbs = [...document.querySelectorAll('.bg-orbs .orb')]
    if (!orbs.length) return { exists: false }
    const cs = getComputedStyle(orbs[0])
    const body = getComputedStyle(document.body)
    return {
      exists: true,
      count: orbs.length,
      animName: cs.animationName,
      playState: cs.animationName === 'none' ? 'none' : getComputedStyle(orbs[0]).animationPlayState,
      opacity: cs.opacity,
      orbColor1: body.getPropertyValue('--orb-1').trim(),
      uiBg: document.body.dataset.uiBg
    }
  })()`)

  // 2. 查看背景跟随界面(--viewer-bg 应等于界面底色)
  out.bgMatch = await s.ev(`(() => {
    const vb = getComputedStyle(document.documentElement).getPropertyValue('--viewer-bg').trim()
    const bodyBg = getComputedStyle(document.body).backgroundColor
    return { viewerBg: vb, bodyColor: bodyBg, equal: vb === bodyBg }
  })()`)

  // 3. 打开预览器看底色一致性
  const c0 = await s.center('.card', 0)
  await s.click(c0.x, c0.y)
  await s.sleep(250)
  await s.key(' ', 'Space', 32)
  await s.sleep(700)
  out.previewBg = await s.ev(`(() => {
    const p = document.querySelector('.previewer')
    if (!p) return { open: false }
    const cs = getComputedStyle(p)
    const vb = getComputedStyle(document.documentElement).getPropertyValue('--viewer-bg').trim()
    return { open: true, previewColor: cs.backgroundColor, viewerBg: vb, equal: cs.backgroundColor === vb }
  })()`)
  await s.key('Escape', 'Escape', 27)
  await s.sleep(300)

  // 4. 外观对话框:follow 选项存在且默认选中;切石墨后光斑隐藏,取消还原
  const lookBtn = await s.ev(`(() => {
    const btns = [...document.querySelectorAll('button')]
    const b = btns.find((x) => /外观/.test(x.title || x.textContent))
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)
  if (lookBtn) {
    await s.click(lookBtn.x, lookBtn.y)
    await s.sleep(600)
    out.dialog = await s.ev(`(() => {
      const d = document.querySelector('.dlg[aria-label=外观与背景]')
      if (!d) return { open: false }
      const swatches = [...d.querySelectorAll('.swatch')]
      const follow = swatches.find((x) => x.title === '跟随界面背景' || x.getAttribute('aria-label') === '跟随界面背景')
      return { open: true, swatchCount: swatches.length, followFound: !!follow, followActive: follow ? follow.className.includes('active') : null }
    })()`)
    // 点「石墨」swatch → 光斑应隐藏
    const graphite = await s.ev(`(() => {
      const d = document.querySelector('.dlg[aria-label=外观与背景]')
      const secs = [...d.querySelectorAll('.sec-title')]
      const uiSec = secs[0]
      const swatches = [...uiSec.parentElement.querySelectorAll('.swatch')]
      const g = swatches.find((x) => x.title === '石墨')
      if (!g) return null
      const r = g.getBoundingClientRect()
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
    })()`)
    if (graphite) {
      await s.click(graphite.x, graphite.y)
      await s.sleep(500)
      out.graphiteOrbs = await s.ev(`(() => {
        const o = document.querySelector('.bg-orbs .orb')
        return { uiBg: document.body.dataset.uiBg, orbOpacity: getComputedStyle(o).opacity }
      })()`)
    }
    // 取消:恢复 aurora
    const cancelBtn = await s.ev(`(() => {
      const d = document.querySelector('.dlg[aria-label=外观与背景]')
      const b = [...d.querySelectorAll('button')].find((x) => x.textContent.trim() === '取消')
      const r = b.getBoundingClientRect()
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
    })()`)
    await s.click(cancelBtn.x, cancelBtn.y)
    await s.sleep(500)
    out.afterCancel = await s.ev(`document.body.dataset.uiBg`)
  }

  out.errors = s.errors
  console.log(JSON.stringify(out, null, 1))
  s.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
