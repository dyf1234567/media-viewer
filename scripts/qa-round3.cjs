// qa-round3.cjs — 预览按钮 / 导入主色 / policy v5 重析 / 标签去重 回归
const { session } = require('./cdp.cjs')
const fs = require('fs')
const path = require('path')
const os = require('os')

async function main() {
  const s = await session()
  await s.reload()
  await s.sleep(2500) // 等 policy v5 重析推进
  let fail = 0
  const ok = (cond, name) => {
    console.log((cond ? '  ✓ ' : '  ✗ ') + name)
    if (!cond) fail++
  }

  // 1. policy v5:库里 ComfyUI 图重析后仍有 aiMeta
  console.log('— policy v5 重析 —')
  const comfy = await s.ev(`(async () => {
    const lib = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.library
    const img = [...lib.byId.values()].find((x) => x.kind === 'image' && x.fileName.includes('005529'))
    return img ? img.id : null
  })()`, true)
  const meta = await s.ev(`(async () => {
    const full = await window.mv.assets.get(${comfy ?? 0})
    return full && full.aiMeta ? full.aiMeta.source : 'null'
  })()`, true)
  ok(!!meta && meta !== 'null', `ComfyUI 图重析后有元数据(${meta})`)

  // 2. 预览器按钮可点击
  console.log('— 预览器按钮 —')
  await s.ev(`(() => {
    const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('ui')
    const lib = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.library
    const img = [...lib.byId.values()].find((x) => x.kind === 'image' && !x.missing)
    store.openPreview(img.id)
  })()`)
  await s.sleep(800)
  const pe = await s.ev(`(() => {
    const btn = document.querySelector('.viewer-toolbar .pb-btn')
    return getComputedStyle(btn).pointerEvents
  })()`)
  ok(pe === 'auto', `按钮 pointer-events=${pe}`)
  // 点裁切 → CropOverlay 出现
  const cropIdx = await s.ev(`(() => {
    const btns = [...document.querySelectorAll('.viewer-toolbar .pb-btn')]
    return btns.findIndex((b) => (b.title || '').startsWith('裁切'))
  })()`)
  const cropBtn = await s.center(`.viewer-toolbar .pb-btn:nth-child(${cropIdx + 1})`)
  await s.click(cropBtn.x, cropBtn.y)
  await s.sleep(500)
  const cropping = await s.ev(`!!document.querySelector('.previewer.cropping')`)
  ok(cropping, '点击裁切进入裁切模式(按钮生效)')
  // Esc 退裁切
  await s.key('Escape', 'Escape', 27)
  await s.sleep(400)
  // 缩放滑杆拖到最大 → pct 变化
  const pct1 = await s.ev(`document.querySelector('.zoom-pct').textContent`)
  await s.ev(`(() => {
    const slider = document.querySelector('.zoom-slider')
    slider.value = 100
    slider.dispatchEvent(new Event('input'))
  })()`)
  await s.sleep(300)
  const pct2 = await s.ev(`document.querySelector('.zoom-pct').textContent`)
  ok(pct1 !== pct2 && pct2 === '1000%', `滑杆生效 ${pct1} → ${pct2}`)
  // 滑杆在页码旁边(布局与 Eagle 一致:返回|页码|滑杆|...)
  const order = await s.ev(`(() => {
    const bar = document.querySelector('.viewer-toolbar')
    const kids = [...bar.children].map((x) => x.className.split(' ')[0])
    return { slider: kids.indexOf('zoom-slider'), page: kids.indexOf('pv-page'), flex: kids.indexOf('tb-flex') }
  })()`)
  ok(order.slider >= 0 && order.slider < order.flex && order.page < order.slider, `布局顺序 页码(${order.page})<滑杆(${order.slider})<弹性(${order.flex})`)
  await s.ev(`(() => { document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('ui').preview.open = false })()`)
  await s.sleep(300)

  // 3. 新导入即时主色
  console.log('— 导入主色 —')
  const src = path.join(os.tmpdir(), 'mv-color-test.png')
  // 用库里现成的一张图复制为新文件
  const anyPng = await s.ev(`(async () => {
    const lib = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.library
    const img = [...lib.byId.values()].find((x) => x.kind === 'image' && !x.missing)
    return img.filePath
  })()`, true)
  fs.copyFileSync(anyPng, src)
  const imp = await s.ev(`(async () => {
    const mv = window.mv
    const r = await mv.importer.run([{ path: ${JSON.stringify(src)} }], 'reference')
    return JSON.stringify({ imported: r.imported, failed: r.failed.length })
  })()`, true)
  console.log('    导入结果:', imp)
  await s.sleep(1500)
  const colorsNew = await s.ev(`(async () => {
    const lib = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.library
    const a = [...lib.byId.values()].find((x) => x.fileName === ${JSON.stringify(path.basename(src))})
    if (!a) return 'not-found'
    return a.colors ? a.colors.length + '色/' + (a.colorFamily ?? 'null') : 'null'
  })()`, true)
  ok(colorsNew !== 'null' && colorsNew !== 'not-found' && colorsNew !== 'no-fn', `新导入主色: ${colorsNew}`)

  // 4. 标签区标题不重复
  console.log('— 标签去重 —')
  const sel = await s.center('.card')
  await s.click(sel.x, sel.y)
  await s.sleep(900)
  const tagTitles = await s.ev(`(() => {
    const panel = document.querySelector('.details')
    const titles = [...panel.querySelectorAll('.sec-title')].map((x) => x.textContent.trim())
    return titles.filter((t) => t === '标签').length
  })()`)
  ok(tagTitles <= 1, `「标签」标题出现 ${tagTitles} 次(TagEditor 自带)`)

  console.log(fail ? `✗ ${fail} 项未通过` : '✓ 全部通过')
  console.log('console errors:', s.errors.length)
  s.close()
  process.exit(fail || s.errors.length ? 1 : 0)
}

main().catch((e) => {
  console.error('脚本失败:', e)
  process.exit(1)
})
