// qa-import3.cjs — 诊断导入主色:DB 实值 vs 渲染端
const { session } = require('./cdp.cjs')
const sharp = require('sharp')
const fs = require('fs')
const path = require('path')
const os = require('os')

async function main() {
  const s = await session()
  const tmp = path.join(os.tmpdir(), 'mv-color-test4.png')
  await sharp({
    create: { width: 320, height: 200, channels: 3, background: { r: 30, g: 144, b: 255 } }
  })
    .png()
    .toFile(tmp)
  const r = await s.ev(`(async () => {
    const r = await window.mv.importer.run([{ path: ${JSON.stringify(tmp)}, isDir: false }], 'reference')
    return r.imported
  })()`, true)
  console.log('导入:', r)
  const check = () => s.ev(`(async () => {
    const lib = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.library
    const a = [...lib.byId.values()].find((x) => x.fileName === 'mv-color-test4.png')
    if (!a) return '列表无'
    const full = await window.mv.assets.get(a.id)
    return JSON.stringify({ list: a.colors ? a.colors.length : null, db: full ? (full.colors ? full.colors.length : null) : '无记录', family: a.colorFamily })
  })()`, true)
  console.log('立即查:', await check())
  await s.sleep(3000)
  console.log('3秒后:', await check())
  // 清理
  await s.ev(`(async () => {
    const lib = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.library
    const a = [...lib.byId.values()].find((x) => x.fileName === 'mv-color-test4.png')
    if (a) await window.mv.assets.deleteForever([a.id])
  })()`, true)
  fs.rmSync(tmp, { force: true })
  s.close()
}

main().catch((e) => { console.error('失败:', e.message); process.exit(1) })
