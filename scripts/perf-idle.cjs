// perf-idle.cjs — 静置帧率(无输入):分离"后台干扰"与"拖拽本身"
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  await s.sleep(1500)
  // 打开预览但不做任何输入
  await s.ev(`(() => {
    const app = document.querySelector('#app').__vue_app__
    const store = app.config.globalProperties.$pinia._s.get('ui')
    const lib = app.config.globalProperties.$pinia.state.value.library
    const imgs = [...lib.byId.values()].filter((x) => x.kind === 'image' && !x.missing && !x.deletedAt)
    if (!imgs.length) return
    store.openPreview(imgs[0].id)
  })()`, true)
  await s.sleep(2500)
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
  await s.sleep(8000) // 纯静置 8 秒
  const r = await s.ev(`(() => {
    const f = window.__frames
    window.__probe = false
    const gaps = []
    for (let i = 1; i < f.length; i++) gaps.push(f[i] - f[i - 1])
    gaps.sort((a, b) => a - b)
    return { sec: 8, fps: Math.round(f.length / ((f[f.length - 1] - f[0]) / 1000)), maxGap: Math.round(gaps[gaps.length - 1]), over100: gaps.filter((g) => g > 100).length, longList: window.__long }
  })()`)
  console.log('静置 8 秒:', JSON.stringify(r))
  s.close()
}

main().catch((e) => {
  console.error('失败:', e.message)
  process.exit(1)
})
