// profiler-drag.cjs — 拖拽期间 CPU 采样,定位主线程长任务元凶
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  await s.sleep(1500)

  // 打开最大图预览
  const opened = await s.ev(`(() => {
    const app = document.querySelector('#app').__vue_app__
    const store = app.config.globalProperties.$pinia._s.get('ui')
    const lib = app.config.globalProperties.$pinia.state.value.library
    const imgs = [...lib.byId.values()].filter((x) => x.kind === 'image' && !x.missing && !x.deletedAt)
    imgs.sort((a, b) => b.width * b.height - a.width * a.height)
    if (!imgs.length) return null
    store.openPreview(imgs[0].id)
    return imgs[0].fileName
  })()`, true)
  console.log('预览:', opened)
  await s.sleep(2000)

  const stage = await s.ev(`(() => {
    const st = document.querySelector('.stage')
    const r = st.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)

  await s.send('Profiler.enable')
  await s.send('Profiler.start')

  await s.mouse.down(stage.x, stage.y)
  for (let i = 0; i < 80; i++) {
    await s.mouse.move(stage.x + i * 5, stage.y + Math.sin(i / 6) * 30)
    await new Promise((r) => setTimeout(r, 12))
  }
  await s.mouse.up(stage.x + 400, stage.y)

  const { profile } = await s.send('Profiler.stop')
  // 汇总自耗时最多的节点
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]))
  const self = new Map()
  for (const [id, hits] of Object.entries(profile.timeDeltas ? {} : {})) void id
  // timeDeltas 与 samples 对应:统计每个 sample 命中的节点
  const selfMs = new Map()
  for (let i = 0; i < profile.samples.length; i++) {
    const dt = profile.timeDeltas[i] || 0
    const id = profile.samples[i]
    selfMs.set(id, (selfMs.get(id) || 0) + dt)
  }
  const rows = [...selfMs.entries()]
    .map(([id, ms]) => {
      const n = nodes.get(id)
      const f = n ? n.callFrame : { functionName: '?', url: '?' }
      return { fn: f.functionName || '(匿名)', url: (f.url || '').split('/').slice(-1)[0].slice(0, 30), line: f.lineNumber, ms: Math.round(ms / 1000) }
    })
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 15)
  console.log('拖拽期间主线程热点(自耗时):')
  for (const r of rows) console.log(`  ${String(r.ms).padStart(5)}ms  ${r.fn}  ${r.url}:${r.line}`)
  s.close()
}

main().catch((e) => {
  console.error('失败:', e.message)
  process.exit(1)
})
