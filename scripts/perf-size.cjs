// perf-size.cjs — 对比大图/小图拖拽帧冻结,确认是否与图像尺寸相关
const { session } = require('./cdp.cjs')

async function dragProbe(s) {
  const stage = await s.ev(`(() => {
    const st = document.querySelector('.stage')
    if (!st) return null
    const r = st.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)
  if (!stage) return null
  await s.ev(`(() => {
    window.__frames = []
    window.__long = []
    window.__probe = true
    const loop = (t) => { if (!window.__probe) return; window.__frames.push(t); requestAnimationFrame(loop) }
    requestAnimationFrame(loop)
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(Math.round(e.duration)) })
        .observe({ entryTypes: ['longtask'] })
    } catch {}
  })()`)
  await s.mouse.down(stage.x, stage.y)
  for (let i = 0; i < 50; i++) {
    await s.mouse.move(stage.x + i * 6, stage.y + Math.cos(i / 6) * 25)
    await new Promise((r) => setTimeout(r, 10))
  }
  await s.mouse.up(stage.x + 300, stage.y)
  await s.sleep(400)
  return s.ev(`(() => {
    const f = window.__frames
    window.__probe = false
    const gaps = []
    for (let i = 1; i < f.length; i++) gaps.push(f[i] - f[i - 1])
    gaps.sort((a, b) => a - b)
    const totalLong = window.__long.reduce((a, b) => a + b, 0)
    return { fps: Math.round(f.length / ((f[f.length - 1] - f[0]) / 1000)), maxGap: Math.round(gaps[gaps.length - 1]), over100: gaps.filter((g) => g > 100).length, longMs: Math.round(totalLong) }
  })()`)
}

async function main() {
  const s = await session()
  await s.sleep(1500)
  for (const pick of ['largest', 'smallest']) {
    const info = await s.ev(`(async () => {
      const app = document.querySelector('#app').__vue_app__
      const store = app.config.globalProperties.$pinia._s.get('ui')
      const lib = app.config.globalProperties.$pinia.state.value.library
      const imgs = [...lib.byId.values()].filter((x) => x.kind === 'image' && !x.missing && !x.deletedAt)
      imgs.sort((a, b) => (b.width * b.height - a.width * a.height) * (${pick === 'largest' ? 1 : -1}))
      if (!imgs.length) return null
      store.openPreview(imgs[0].id)
      return imgs[0].fileName + ' ' + imgs[0].width + 'x' + imgs[0].height
    })()`, true)
    await s.sleep(2500) // 等加载稳定
    const r = await dragProbe(s)
    console.log(`${pick} [${info}]:`, JSON.stringify(r))
  }
  s.close()
}

main().catch((e) => {
  console.error('失败:', e.message)
  process.exit(1)
})
