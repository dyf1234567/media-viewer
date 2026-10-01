// qa-import-colors.cjs — 验证导入即时主色 + 清理测试资产
const { session } = require('./cdp.cjs')
const fs = require('fs')
const path = require('path')
const os = require('os')

async function main() {
  const s = await session()
  // 先清掉上次测试可能留下的资产
  const stale = await s.ev(`(async () => {
    const lib = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.library
    const old = [...lib.byId.values()].filter((x) => x.fileName.startsWith('mv-color-test'))
    for (const a of old) await window.mv.assets.deleteForever([a.id])
    return old.length
  })()`, true)
  console.log('清理旧测试资产:', stale)

  // 复制一张图为新文件并导入
  const src = await s.ev(`(async () => {
    const lib = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.library
    const img = [...lib.byId.values()].find((x) => x.kind === 'image' && !x.missing && !x.fileName.startsWith('mv-color-test'))
    return img.filePath
  })()`, true)
  const tmp = path.join(os.tmpdir(), 'mv-color-test2.png')
  // 用 sharp 调色相生成内容唯一的新图(否则内容去重会跳过)
  const sharp = require('sharp')
  await sharp(src).modulate({ hue: 137 }).toFile(tmp)
  const imp = await s.ev(`(async () => {
    const r = await window.mv.importer.run([{ path: ${JSON.stringify(tmp)}, isDir: false }], 'reference')
    return JSON.stringify({ imported: r.imported, skipped: r.skipped.length, failed: r.failed.length })
  })()`, true)
  console.log('导入:', imp)
  await s.sleep(1200)
  const colors = await s.ev(`(async () => {
    const lib = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.library
    const a = [...lib.byId.values()].find((x) => x.fileName === 'mv-color-test2.png')
    return a ? { colors: a.colors ? a.colors.length : null, family: a.colorFamily } : 'not-found'
  })()`, true)
  const pass = colors !== 'not-found' && colors.colors !== null
  console.log(pass ? `  ✓ 新导入即时主色: ${JSON.stringify(colors)}` : `  ✗ 新导入主色: ${JSON.stringify(colors)}`)
  // 清理
  const cleaned = await s.ev(`(async () => {
    const lib = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.library
    const a = [...lib.byId.values()].find((x) => x.fileName === 'mv-color-test2.png')
    if (a) await window.mv.assets.deleteForever([a.id])
    return !!a
  })()`, true)
  fs.rmSync(tmp, { force: true })
  console.log('清理测试导入:', cleaned)
  s.close()
  process.exit(pass ? 0 : 1)
}

main().catch((e) => { console.error('失败:', e.message); process.exit(1) })
