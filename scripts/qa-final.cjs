// qa-final.cjs — v1.2.3 发布前最终验收
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  await s.sleep(9000) // 等 policy v7 重析
  let fail = 0
  const ok = (cond, name) => {
    console.log((cond ? '  ✓ ' : '  ✗ ') + name)
    if (!cond) fail++
  }

  // 1. 全库 aiMeta 重析(含回收站)
  console.log('— policy v7 重析 —')
  const r = await s.ev(`(async () => {
    const lib = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.library
    const arr = [...lib.byId.values()].filter((x) => x.kind === 'image')
    let withMeta = 0
    let comfy = 0
    for (const a of arr) {
      const f = await window.mv.assets.get(a.id)
      if (f && f.aiMeta) {
        withMeta++
        if (f.aiMeta.source === 'comfyui') comfy++
      }
    }
    return { n: arr.length, withMeta, comfy }
  })()`, true)
  console.log(`    图片 ${r.n},有元数据 ${r.withMeta},comfyui ${r.comfy}`)
  ok(r.withMeta >= 6, '重析后元数据覆盖正常')
  ok(r.comfy >= 4, 'ComfyUI 图全部有解析(含回收站/LLM 流)')

  // 2. 预览器按钮 + 布局
  console.log('— 预览器 —')
  await s.ev(`(() => {
    const app = document.querySelector('#app').__vue_app__
    const store = app.config.globalProperties.$pinia._s.get('ui')
    const lib = app.config.globalProperties.$pinia.state.value.library
    const img = [...lib.byId.values()].find((x) => x.kind === 'image' && !x.missing)
    store.openPreview(img.id)
  })()`)
  await s.sleep(800)
  const pv = await s.ev(`(() => {
    const bar = document.querySelector('.viewer-toolbar')
    const btn = bar.querySelector('.pb-btn')
    const kids = [...bar.children].map((x) => x.className.split(' ')[0])
    const cropBtn = [...bar.querySelectorAll('.pb-btn')].find((b) => (b.title || '').startsWith('裁切'))
    return { pe: getComputedStyle(btn).pointerEvents, kids, hasCrop: !!cropBtn }
  })()`)
  ok(pv.pe === 'auto', `按钮可点击(pointer-events=${pv.pe})`)
  ok(pv.hasCrop, '裁切按钮存在')
  const si = pv.kids.indexOf('zoom-slider')
  const pi = pv.kids.indexOf('pv-page')
  const fi = pv.kids.indexOf('tb-flex')
  ok(pi === 1 && si === 2 && si < fi, `布局: 返回|页码(${pi})|滑杆(${si})|…|弹性(${fi})`)
  // 点裁切实测
  await s.ev(`(() => {
    const bar = document.querySelector('.viewer-toolbar')
    const cropBtn = [...bar.querySelectorAll('.pb-btn')].find((b) => (b.title || '').startsWith('裁切'))
    cropBtn.click()
  })()`)
  await s.sleep(500)
  ok(await s.ev(`!!document.querySelector('.previewer.cropping')`), '裁切按钮点击生效')
  await s.ev(`(() => { document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('ui').preview.open = false })()`)
  await s.sleep(300)

  // 3. 详情面板标签不重复 + 色点(选图片卡)
  console.log('— 详情面板 —')
  await s.ev(`(() => {
    const app = document.querySelector('#app').__vue_app__
    app.config.globalProperties.$pinia.state.value.ui.search = '小红图'
    return true
  })()`)
  await s.sleep(600)
  const sel = await s.center('.card')
  await s.click(sel.x, sel.y)
  await s.sleep(900)
  await s.ev(`(() => { document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.ui.search = '' })()`)
  await s.sleep(300)
  const dp = await s.ev(`(() => {
    const panel = document.querySelector('.details')
    const titles = [...panel.querySelectorAll('.sec-title')].map((x) => x.textContent.trim())
    return { tagTitles: titles.filter((t) => t === '标签').length, pill: !!panel.querySelector('.colors-pill') }
  })()`)
  ok(dp.tagTitles <= 1, `「标签」标题 ${dp.tagTitles} 次`)
  ok(dp.pill, '主题色药丸行存在')

  console.log(fail ? `✗ ${fail} 项未通过` : '✓ 全部通过')
  console.log('console errors:', s.errors.length)
  s.close()
  process.exit(fail || s.errors.length ? 1 : 0)
}

main().catch((e) => {
  console.error('失败:', e)
  process.exit(1)
})
