// 千张图库基准:导入吞吐 / 列表加载 / 虚拟滚动 / 搜索 / 相似查重
const { session } = require('./cdp.cjs')
const fs = require('fs')

async function main() {
  const s = await session()
  await s.sleep(1000)
  const out = { N: 1000 }

  // 1. 导入吞吐(整目录递归,引用模式)
  const t0 = Date.now()
  const report = await s.ev(
    `window.mv.importer.run([{ path: 'C:\\\\Users\\\\17839\\\\Pictures\\\\MV-bench', isDir: true }], 'reference').then(r => ({ imported: r.imported, reused: r.reused, failed: r.failed.length }))`,
    true
  )
  out.import = { ...report, ms: Date.now() - t0 }
  out.import.perSec = +(report.imported / ((Date.now() - t0) / 1000)).toFixed(1)
  await s.sleep(2500)

  // 2. 全库 assets.list + 首屏渲染
  out.list = await s.ev(
    `(() => { const t = performance.now(); return window.mv.assets.list().then(r => ({ assets: r.assets.length, ipcMs: Math.round(performance.now() - t) })) })()`,
    true
  )
  await s.sleep(500)
  out.domCards = await s.ev(`document.querySelectorAll('.card').length`)
  out.statusCount = await s.ev(`document.querySelector('.status-bar')?.textContent.match(/(\\d+) 项/)?.[1]`)

  // 3. 滚动性能:跳到底部再跳回顶部,测两次
  out.scroll = await s.ev(`(() => {
    const el = document.querySelector('.grid-container')
    const t0 = performance.now()
    el.scrollTop = el.scrollHeight
    el.scrollTop = 0
    el.scrollTop = el.scrollHeight * 0.6
    return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => res({ ms: Math.round(performance.now() - t0), height: Math.round(el.scrollHeight) }))))
  })()`, true)
  await s.sleep(800)
  out.domCardsAfterScroll = await s.ev(`document.querySelectorAll('.card').length`)

  // 4. 搜索响应(set 值 + input 事件,测 UI 过滤到 DOM 更新)
  out.search = await s.ev(`(() => {
    const i = document.querySelector('input[placeholder*=搜索]')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    const t0 = performance.now()
    setter.call(i, 'bench-0500')
    i.dispatchEvent(new Event('input', { bubbles: true }))
    return new Promise(res => setTimeout(() => res({ ms: Math.round(performance.now() - t0), cards: document.querySelectorAll('.card').length }), 600))
  })()`, true)
  // 清空搜索
  await s.ev(`(() => { const i = document.querySelector('input[placeholder*=搜索]'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
  await s.sleep(600)

  // 5. 相似查重全库比对(1000² ≈ 50 万对)
  const t5 = Date.now()
  out.similar = await s.ev(`window.mv.assets.findSimilar(8).then(r => r.length)`, true)
  out.similarMs = Date.now() - t5

  // 6. 清理:全部 bench 图移入回收站再永久删除
  const t6 = Date.now()
  out.cleanup = await s.ev(
    `window.mv.assets.list().then(r => { const ids = r.assets.filter(a => a.fileName.startsWith('bench-')).map(a => a.id); return window.mv.assets.toTrash(ids).then(() => window.mv.assets.deleteForever(ids)).then(res => ({ deleted: ids.length, failed: res.filter(x => !x.ok).length })) })`,
    true
  )
  out.cleanupMs = Date.now() - t6
  out.finalCount = await s.ev(`window.mv.assets.list().then(r => r.assets.length)`, true)
  await s.sleep(500)

  // 删临时目录
  try {
    fs.rmSync('C:\\Users\\17839\\Pictures\\MV-bench', { recursive: true, force: true })
  } catch {}

  out.errors = s.errors.slice(0, 3)
  console.log(JSON.stringify(out, null, 1))
  s.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
