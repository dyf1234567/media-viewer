// 核实重命名结果 + 恢复名称
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  const out = {}
  out.assets = await s.ev(
    `window.mv.assets.list().then(r => ({ names: r.assets.map(a => a.fileName).sort(), tags: r.tags.map(t => t.name) }))`,
    true
  )
  // 恢复:把 改名测试-QA.mp4 改回原名
  out.restored = await s.ev(
    `window.mv.assets.list().then(r => { const a = r.assets.find(x => x.fileName.startsWith('改名测试-QA')); return a ? window.mv.assets.rename(a.id, '测试视频-被测片').then(x => x.success ?? x).catch(e => 'ERR:' + e.message) : 'not-found' })`,
    true
  )
  await s.sleep(500)
  out.final = await s.ev(
    `window.mv.assets.list().then(r => r.assets.map(a => a.fileName).sort())`,
    true
  )
  out.errors = s.errors
  console.log(JSON.stringify(out, null, 1))
  s.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
