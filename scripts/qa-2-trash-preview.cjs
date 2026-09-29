// 测试 2:回收站流程(移入→查看→恢复) + 预览器键盘 + 视频播放
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  await s.reload()
  const out = {}
  const count = () => s.ev(`document.querySelectorAll('.card').length`)
  const scopeText = () => s.ev(`document.querySelector('.status-bar .scope-chip')?.textContent.trim()`)

  // ---- 回收站流程 ----
  out.countBefore = await count()
  const imgCard = await s.ev(`(() => {
    const cards = [...document.querySelectorAll('.card')]
    const c = cards.find((x) => !x.querySelector('.kind-badge'))
    return c ? c.querySelector('.card-name')?.textContent : null
  })()`)
  out.targetAsset = imgCard

  // 选中第一张图片卡 → Delete → 确认
  const idx = await s.ev(`(() => {
    const cards = [...document.querySelectorAll('.card')]
    return cards.findIndex((x) => !x.querySelector('.kind-badge'))
  })()`)
  const c = await s.center('.card', idx)
  await s.click(c.x, c.y)
  await s.sleep(200)
  await s.key('Delete', 'Delete', 46)
  await s.sleep(400)
  out.dlgHead = await s.ev(`document.querySelector('.dlg[role=dialog] .dlg-head')?.textContent`)
  // 点「移入回收站」执行
  const okBtn = await s.center('.dlg-foot .btn.danger')
  await s.click(okBtn.x, okBtn.y)
  await s.sleep(800)
  out.countAfterTrash = await count()
  out.trashBadge = await s.ev(`(() => {
    const items = [...document.querySelectorAll('.nav-item')]
    const t = items.find((x) => x.textContent.includes('回收站'))
    return t?.querySelector('.badge, [class*=badge]')?.textContent ?? null
  })()`)

  // 切到回收站视图
  const trashNav = await s.ev(`(() => {
    const items = [...document.querySelectorAll('.nav-item')]
    const t = items.find((x) => x.textContent.includes('回收站'))
    if (!t) return null
    const r = t.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)
  await s.click(trashNav.x, trashNav.y)
  await s.sleep(600)
  out.trashScope = await scopeText()
  out.trashCards = await count()
  out.trashCardName = await s.ev(`document.querySelector('.card .card-name')?.textContent`)
  out.trashRatingVisible = await s.ev(`!!document.querySelector('.card .card-rating')`)

  // 选中并恢复
  const tc = await s.center('.card', 0)
  await s.click(tc.x, tc.y)
  await s.sleep(300)
  const restoreBtn = await s.ev(`(() => {
    const b = [...document.querySelectorAll('.batch-bar button')].find((x) => x.textContent.includes('恢复'))
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)
  if (restoreBtn) {
    await s.click(restoreBtn.x, restoreBtn.y)
    await s.sleep(800)
  }
  out.afterRestoreCards = await count()

  // 回到全部素材
  const allNav = await s.ev(`(() => {
    const items = [...document.querySelectorAll('.nav-item')]
    const t = items.find((x) => x.textContent.includes('全部素材'))
    const r = t.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)
  await s.click(allNav.x, allNav.y)
  await s.sleep(600)
  out.finalScope = await scopeText()
  out.finalCount = await count()

  // ---- 预览器 ----
  const c0 = await s.center('.card', 0)
  await s.click(c0.x, c0.y)
  await s.sleep(200)
  await s.key(' ', 'Space', 32)
  await s.sleep(700)
  out.previewOpen = await s.ev(`!!document.querySelector('.previewer')`)
  const pageInfo = () =>
    s.ev(`(() => {
      const el = [...document.querySelectorAll('.previewer *')].find((x) => /^\\d+ \\/ \\d+$/.test(x.textContent.trim()))
      return el ? el.textContent.trim() : null
    })()`)
  out.page1 = await pageInfo()
  await s.key('ArrowRight', 'ArrowRight', 39)
  await s.sleep(350)
  out.page2 = await pageInfo()
  const zoomInfo = () =>
    s.ev(`(() => {
      const el = [...document.querySelectorAll('.previewer *')].find((x) => /^\\d+%$/.test(x.textContent.trim()))
      return el ? el.textContent.trim() : null
    })()`)
  out.zoomInitial = await zoomInfo()
  for (let i = 0; i < 3; i++) await s.key('+', 'Equal', 187)
  await s.sleep(300)
  out.zoomAfterPlus = await zoomInfo()
  await s.key('0', 'Digit0', 48)
  await s.sleep(300)
  out.zoomAfterFit = await zoomInfo()
  await s.key('r', 'KeyR', 82)
  await s.sleep(500)
  out.afterRotate = await s.ev(`!!document.querySelector('.previewer')`) // 旋转写盘中不崩溃
  await s.sleep(600)
  await s.key('Escape', 'Escape', 27)
  await s.sleep(300)
  out.previewClosed = await s.ev(`!document.querySelector('.previewer')`)

  // 视频预览
  const vIdx = await s.ev(`(() => {
    const cards = [...document.querySelectorAll('.card')]
    return cards.findIndex((x) => x.querySelector('.kind-badge'))
  })()`)
  if (vIdx >= 0) {
    const vc = await s.center('.card', vIdx)
    await s.click(vc.x, vc.y)
    await s.sleep(250)
    await s.key(' ', 'Space', 32)
    await s.sleep(900)
    out.videoPreviewOpen = await s.ev(`!!document.querySelector('.previewer video, .previewer .player, .previewer')`)
    out.videoControls = await s.ev(`(() => {
      const p = document.querySelector('.previewer')
      if (!p) return null
      const btns = [...p.querySelectorAll('button')].map((b) => b.title || b.textContent.trim()).filter(Boolean)
      return btns.slice(0, 8)
    })()`)
    // 点播放按钮
    const playBtn = await s.ev(`(() => {
      const p = document.querySelector('.previewer')
      const b = [...p.querySelectorAll('button')].find((x) => /播放|暂停|play/i.test(x.title || x.textContent))
      if (!b) return null
      const r = b.getBoundingClientRect()
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
    })()`)
    if (playBtn) {
      await s.click(playBtn.x, playBtn.y)
      await s.sleep(800)
      out.videoPlaying = await s.ev(`(() => { const v = document.querySelector('.previewer video'); return v ? { t: Math.round(v.currentTime * 10) / 10, paused: v.paused, w: v.videoWidth } : 'no-video-el' })()`)
    }
    await s.key('Escape', 'Escape', 27)
    await s.sleep(300)
  }

  out.errors = s.errors
  console.log(JSON.stringify(out, null, 1))
  s.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
