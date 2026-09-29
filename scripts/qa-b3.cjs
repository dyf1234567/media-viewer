// 批次3验证:相似查重全链路(导入近似图→查找→命中→加入对比→清理)
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  const out = {}

  // 1. 导入近似图(引用模式)
  out.import = await s.ev(
    `window.mv.importer.run([{ path: 'C:\\\\Users\\\\17839\\\\Pictures\\\\MV-测试素材\\\\相似测试-压缩版.jpg', isDir: false }], 'reference').then(r => ({ imported: r.imported, reused: r.reused }))`,
    true
  )
  await s.sleep(2500)

  // 2. 指纹就绪检查(全库图片 phash 非空数)
  out.phashCount = await s.ev(
    `window.mv.assets.list().then(r => r.assets.filter(a => a.kind === 'image' && !a.deletedAt).length)`,
    true
  )

  // 3. 直接调 findSimilar API 验证命中
  out.api = await s.ev(`window.mv.assets.findSimilar(10).then(r => r.map(p => p.aName + ' <-> ' + p.bName + ' d=' + p.dist))`, true)

  // 4. UI:打开查相似对话框
  await s.ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>/查相似/.test(x.textContent)); if(!b) return false; b.click(); return true })()`)
  await s.sleep(500)
  out.dialog = await s.ev(`(() => { const d=document.querySelector('.dlg[aria-label=查找相似图片]'); return d ? { open: true, role: d.getAttribute('role') } : { open: false } })()`)

  // 5. 点「开始查找」
  await s.ev(`(() => { const d=document.querySelector('.dlg[aria-label=查找相似图片]'); const b=[...d.querySelectorAll('button')].find(x=>/开始查找|重新查找/.test(x.textContent)); b?.click(); return true })()`)
  await s.sleep(1500)
  out.rows = await s.ev(`(() => { const rows=[...document.querySelectorAll('.sim-row')]; return rows.map(r=>r.textContent.replace(/\\s+/g,' ').trim().slice(0,70)) })()`)

  // 6. 点第一对的「加入对比」
  await s.ev(`(() => { const b=document.querySelector('.sim-row .btn'); b?.click(); return true })()`)
  await s.sleep(700)
  out.tray = await s.ev(`document.querySelector('.tray-pill')?.textContent.trim()`)

  // 7. 关闭对话框 + 清空托盘 + 删除测试图
  await s.key('Escape', 'Escape', 27)
  await s.sleep(300)
  await s.ev(`(() => { const p=document.querySelector('.tray-pill'); if(p)p.click(); return true })()`)
  await s.sleep(300)
  await s.ev(`(() => { const p=document.querySelector('.tray-panel'); if(!p)return false; const b=[...p.querySelectorAll('button')].find(x=>/清空/.test(x.textContent)); b?.click(); return true })()`)
  await s.sleep(300)
  out.cleaned = await s.ev(
    `window.mv.assets.list().then(r => { const a = r.assets.find(x => x.fileName === '相似测试-压缩版.jpg'); return a ? window.mv.assets.deleteForever([a.id]).then(() => 'deleted').catch(e => 'ERR:' + e.message) : 'not-found' })`,
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
