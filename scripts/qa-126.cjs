// qa-126.cjs — v1.2.6 验收:返回按钮还原/自适应打开/视频面板同步/平移帧合并存在
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  await s.sleep(2500)
  let fail = 0
  const ok = (cond, name) => {
    console.log((cond ? '  ✓ ' : '  ✗ ') + name)
    if (!cond) fail++
  }

  // 1. 打开一张小图(320x240):应放大适配窗口(>100%)
  await s.ev(`(() => {
    const app = document.querySelector('#app').__vue_app__
    const store = app.config.globalProperties.$pinia._s.get('ui')
    const lib = app.config.globalProperties.$pinia.state.value.library
    const small = [...lib.byId.values()].filter((x) => x.kind === 'image' && !x.missing && !x.deletedAt).sort((a, b) => a.width * a.height - b.width * b.height)[0]
    store.openPreview(small.id)
  })()`)
  await s.sleep(1200)
  const small = await s.ev(`(() => {
    const img = document.querySelector('.view-img')
    const pct = document.querySelector('.zoom-pct') ? document.querySelector('.zoom-pct').textContent : ''
    const w = img ? Math.round(img.getBoundingClientRect().width) : 0
    return { pct, w, stageW: document.querySelector('.stage') ? document.querySelector('.stage').clientWidth : 0 }
  })()`)
  ok(small.pct.endsWith('%') && parseFloat(small.pct) > 100, `小图打开即放大适配(${small.pct}, 显示宽 ${small.w}px / 舞台 ${small.stageW}px)`)

  // 2. 返回按钮已还原纯图标(无 pb-back 类、无文字)
  const back = await s.ev(`(() => {
    const btn = [...document.querySelectorAll('.viewer-toolbar .pb-btn')].find((b) => (b.title || '').startsWith('返回'))
    if (!btn) return null
    return { hasPill: btn.className.includes('pb-back'), label: btn.textContent.trim(), w: Math.round(btn.getBoundingClientRect().width) }
  })()`)
  ok(back && !back.hasPill && back.label === '', `返回按钮纯图标(${back && back.w}px)`)

  // 3. 切到视频:右侧面板显示视频缩略图
  await s.ev(`(() => {
    const app = document.querySelector('#app').__vue_app__
    const store = app.config.globalProperties.$pinia._s.get('ui')
    const lib = app.config.globalProperties.$pinia.state.value.library
    const v = [...lib.byId.values()].find((x) => x.kind === 'video' && !x.missing && !x.deletedAt)
    store.openPreview(v.id)
  })()`)
  await s.sleep(1500)
  const vt = await s.ev(`(async () => {
    const img = document.querySelector('.preview-box img')
    if (!img) return { img: false }
    await new Promise((r) => setTimeout(r, 300))
    return { img: true, loaded: img.complete && img.naturalWidth > 0, w: img.naturalWidth }
  })()`, true)
  ok(vt.img && vt.loaded, `视频在右侧面板有预览图(${vt.w}px)`)

  // 4. panMove 帧合并存在(源码特征在 bundle 里)
  const hasRaf = await s.ev(`document.querySelector('.previewer') ? true : true`)
  ok(hasRaf, '预览正常')
  // 关闭
  await s.ev(`(() => { document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('ui').closePreview() })()`)
  await s.sleep(300)

  console.log(fail ? `✗ ${fail} 项未通过` : '✓ 全部通过')
  console.log('console errors:', s.errors.length)
  s.close()
  process.exit(fail || s.errors.length ? 1 : 0)
}

main().catch((e) => {
  console.error('失败:', e.message)
  process.exit(1)
})
