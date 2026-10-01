// perf-preview.cjs — 预览器拖拽帧率与卡顿测量
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  await s.sleep(2000)

  // 找像素数最大的图并打开预览
  const opened = await s.ev(`(async () => {
    const app = document.querySelector('#app').__vue_app__
    const store = app.config.globalProperties.$pinia._s.get('ui')
    const lib = app.config.globalProperties.$pinia.state.value.library
    const imgs = [...lib.byId.values()].filter((x) => x.kind === 'image' && !x.missing && !x.deletedAt)
    imgs.sort((a, b) => b.width * b.height - a.width * a.height)
    if (!imgs.length) return null
    store.openPreview(imgs[0].id)
    return { name: imgs[0].fileName, w: imgs[0].width, h: imgs[0].height }
  })()`, true)
  console.log('打开预览:', JSON.stringify(opened))
  await s.sleep(2000)

  const stage = await s.ev(`(() => {
    const st = document.querySelector('.stage')
    const r = st.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)
  console.log('stage 中心:', JSON.stringify(stage))

  // 启动 rAF 帧率采样 + longtask 观察(带时间戳,便于定位阶段)
  console.log('安装探针...')
  await s.ev(`(() => {
    window.__frames = []
    window.__long = []
    window.__marks = []
    window.__probe = true
    const loop = (t) => { if (!window.__probe) return; window.__frames.push(t); requestAnimationFrame(loop) }
    requestAnimationFrame(loop)
    window.__mark = (name) => window.__marks.push({ name, t: performance.now() })
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push({ start: Math.round(e.startTime), dur: Math.round(e.duration) }) })
        .observe({ entryTypes: ['longtask'] })
    } catch {}
    return 'ok'
  })()`)
  console.log('探针就绪')
  await s.ev(`window.__mark('阶段0:打开后静止')`)
  console.log('阶段0 标记')
  await s.sleep(1200)

  await s.ev(`window.__mark('阶段1:悬停移动')`)
  for (let i = 0; i < 40; i++) {
    await s.mouse.move(stage.x + i * 8, stage.y + Math.sin(i / 5) * 20)
    await new Promise((r) => setTimeout(r, 12))
  }
  await s.ev(`window.__mark('阶段2:拖拽平移')`)
  await s.mouse.down(stage.x, stage.y)
  for (let i = 0; i < 60; i++) {
    await s.mouse.move(stage.x + i * 6, stage.y + Math.cos(i / 6) * 30)
    await new Promise((r) => setTimeout(r, 10))
  }
  await s.mouse.up(stage.x + 360, stage.y)
  console.log('拖拽完成')
  await s.ev(`window.__mark('阶段3:滚轮缩放')`)
  for (let i = 0; i < 15; i++) {
    await s.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: stage.x, y: stage.y, deltaX: 0, deltaY: i % 2 ? -120 : 120 })
    await new Promise((r) => setTimeout(r, 30))
  }
  console.log('滚轮完成')
  await s.ev(`window.__mark('阶段4:结束')`)
  await s.sleep(500)

  const r = await s.ev(`(() => {
    const f = window.__frames
    window.__probe = false
    const gaps = []
    for (let i = 1; i < f.length; i++) gaps.push({ at: Math.round(f[i]), gap: Math.round(f[i] - f[i - 1]) })
    const big = gaps.filter((g) => g.gap > 33)
    const sorted = gaps.map((g) => g.gap).sort((a, b) => a - b)
    const marks = window.__marks
    const phaseOf = (t) => { let n = '?'; for (const m of marks) { if (m.t <= t) n = m.name } return n }
    return {
      fps: Math.round(f.length / ((f[f.length - 1] - f[0]) / 1000)),
      medianGap: sorted[Math.floor(sorted.length / 2)],
      jank: big.map((g) => ({ gap: g.gap, phase: phaseOf(g.at) })),
      longtasks: window.__long.map((l) => ({ ...l, phase: phaseOf(l.start) }))
    }
  })()`)
  console.log('帧率报告:', JSON.stringify(r, null, 1))
  console.log('console errors:', s.errors.length)
  s.close()
}

main().catch((e) => {
  console.error('失败:', e.message)
  process.exit(1)
})
