// qa-import2.cjs — 唯一内容导入 → 即时主色 → 清理
const { session } = require('./cdp.cjs')
const sharp = require('sharp')
const fs = require('fs')
const path = require('path')
const os = require('os')

async function main() {
  const s = await session()
  const src = await s.ev(`(async () => {
    const lib = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.library
    const img = [...lib.byId.values()].find((x) => x.kind === 'image' && !x.missing)
    return img.filePath
  })()`, true)
  const tmp = path.join(os.tmpdir(), 'mv-color-test3.png')
  // 全新生成的彩色图(灰度图调色相不变,会被内容去重复用)
  await sharp({
    create: { width: 320, height: 200, channels: 3, background: { r: 30, g: 144, b: 255 } }
  })
    .composite([
      {
        input: { create: { width: 120, height: 120, channels: 3, background: { r: 250, g: 128, b: 20 } } },
        top: 40,
        left: 100
      }
    ])
    .png()
    .toFile(tmp)
  const r = await s.ev(`(async () => {
    const r = await window.mv.importer.run([{ path: ${JSON.stringify(tmp)}, isDir: false }], 'reference')
    return JSON.stringify(r)
  })()`, true)
  console.log('报告:', r)
  const c = await s.ev(`(async () => {
    const lib = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.library
    const a = [...lib.byId.values()].find((x) => x.fileName === 'mv-color-test3.png')
    return a ? { colors: a.colors ? a.colors.length : null, family: a.colorFamily } : null
  })()`, true)
  console.log('即时主色:', JSON.stringify(c), c && c.colors !== null ? '✓' : '✗')
  if (c) {
    await s.ev(`(async () => {
      const lib = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.library
      const a = [...lib.byId.values()].find((x) => x.fileName === 'mv-color-test3.png')
      await window.mv.assets.deleteForever([a.id])
    })()`, true)
    console.log('已清理测试资产')
  }
  fs.rmSync(tmp, { force: true })
  s.close()
  process.exit(c && c.colors !== null ? 0 : 1)
}

main().catch((e) => { console.error('失败:', e.message); process.exit(1) })
