// qa-trash.cjs — 删除语义实测:软删除不动原文件,恢复无感
const { session } = require('./cdp.cjs')
const fs = require('fs')

async function main() {
  const s = await session()
  await s.reload()
  await s.sleep(1500)
  let fail = 0
  const ok = (cond, name) => {
    console.log((cond ? '  ✓ ' : '  ✗ ') + name)
    if (!cond) fail++
  }

  // 取第一张图的路径与 id
  const target = await s.ev(`(async () => {
    const app = document.querySelector('#app').__vue_app__
    const store = app.config.globalProperties.$pinia._s.get('ui')
    const lib = app.config.globalProperties.$pinia.state.value.library
    const img = [...lib.byId.values()].find((x) => x.kind === 'image' && !x.missing && !x.deletedAt)
    return { id: img.id, path: img.filePath, name: img.fileName }
  })()`, true)
  console.log('目标:', target.name, target.path)
  const existsBefore = fs.existsSync(target.path)
  ok(existsBefore, '原文件存在')

  // 经 IPC 移入回收站
  const r1 = await s.ev(`(async () => {
    const mv = window.mv
    const r = await mv.assets.toTrash([${target.id}])
    return r[0].ok
  })()`, true)
  ok(r1, '移入回收站 API 成功')
  await s.sleep(400)
  ok(fs.existsSync(target.path), '软删除后原文件仍在原地(核心验收)')
  const marked = await s.ev(`(async () => {
    const full = await window.mv.assets.get(${target.id})
    return { del: full.deletedAt > 0 }
  })()`, true)
  ok(marked.del, '记录已标记 deleted_at')

  // 恢复
  const r2 = await s.ev(`(async () => {
    const r = await window.mv.assets.restore([${target.id}])
    return r[0].ok
  })()`, true)
  ok(r2, '恢复成功')
  await s.sleep(300)
  ok(fs.existsSync(target.path), '恢复后文件仍在原地')
  const unmarked = await s.ev(`(async () => {
    const full = await window.mv.assets.get(${target.id})
    return !full.deletedAt
  })()`, true)
  ok(unmarked, '标记已清除')

  console.log(fail ? `✗ ${fail} 项未通过` : '✓ 删除语义全部通过')
  s.close()
  process.exit(fail ? 1 : 0)
}

main().catch((e) => {
  console.error('失败:', e.message)
  process.exit(1)
})
