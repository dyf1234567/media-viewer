// probe-resp.cjs — 测渲染进程响应性
const { session } = require('./cdp.cjs')
async function main() {
  const s = await session()
  for (let i = 0; i < 5; i++) {
    const t0 = Date.now()
    const v = await s.ev(`(() => { const t0 = performance.now(); let x = 0; for (let i = 0; i < 1e6; i++) x += i; return Math.round(performance.now() - t0) + 'ms|frames=' + (window.__frames ? window.__frames.length : '-') })()`)
    console.log(`第${i + 1}次 evaluate 耗时 ${Date.now() - t0}ms,页内执行: ${v}`)
    await new Promise((r) => setTimeout(r, 500))
  }
  s.close()
}
main().catch((e) => { console.error('失败:', e.message); process.exit(1) })
