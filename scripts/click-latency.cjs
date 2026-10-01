// click-latency.cjs — 测按钮点击到界面响应的延迟(适应窗口/翻页)
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  await s.sleep(2000)
  // 打开预览
  await s.ev(`(() => {
    const app = document.querySelector('#app').__vue_app__
    const store = app.config.globalProperties.$pinia._s.get('ui')
    const lib = app.config.globalProperties.$pinia.state.value.library
    const img = [...lib.byId.values()].find((x) => x.kind === 'image' && !x.missing && !x.deletedAt)
    store.openPreview(img.id)
  })()`)
  await s.sleep(1500)

  // 在页面里装一个响应延迟探针:点击前打标,MutationObserver+PF 长任务记录
  await s.ev(`(() => {
    window.__clicks = []
    window.__markClick = (name) => window.__clicks.push({ name, t: performance.now() })
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) window.__clicks.push({ longtask: Math.round(e.duration), t: Math.round(e.startTime) })
      }).observe({ entryTypes: ['longtask'] })
    } catch {}
  })()`)

  const fitBtn = await s.center('.viewer-toolbar .pb-btn:nth-child(6)') // 适应窗口(0) 大致位置,失败则用标题找
  // 用标题精确定位
  const pt = await s.ev(`(() => {
    const b = [...document.querySelectorAll('.viewer-toolbar .pb-btn')].find((x) => (x.title || '').startsWith('适应窗口'))
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)
  await s.ev(`window.__markClick('点击前')`)
  const t0 = Date.now()
  await s.click(pt.x, pt.y)
  // 等到 pct 变化
  let waited = 0
  while (waited < 1000) {
    await new Promise((r) => setTimeout(r, 30))
    waited += 30
    const changed = await s.ev(`window.__pctChanged === true`)
    if (changed) break
  }
  console.log('适应窗口 点击→变化 轮询间隔:', waited, 'ms(含 30ms 轮询粒度)')

  // 翻页下一张
  const nx = await s.ev(`(() => {
    const b = [...document.querySelectorAll('.viewer-toolbar .pb-btn')].find((x) => (x.title || '').startsWith('下一张'))
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)
  await s.ev(`window.__markClick('翻页前')`)
  const idBefore = await s.ev(`document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.ui.preview.assetId`)
  await s.click(nx.x, nx.y)
  let w2 = 0
  while (w2 < 1500) {
    await new Promise((r) => setTimeout(r, 30))
    w2 += 30
    const now = await s.ev(`document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.ui.preview.assetId`)
    if (now !== idBefore) break
  }
  console.log('翻页 点击→assetId 变化:', w2, 'ms')

  const clicks = await s.ev(`window.__clicks`)
  console.log('事件记录:', JSON.stringify(clicks))
  console.log('console errors:', s.errors.length)
  s.close()
}

main().catch((e) => {
  console.error('失败:', e.message)
  process.exit(1)
})
