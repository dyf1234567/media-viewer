// qa-129.cjs — 旋转不拉伸 / 返回零等待退出 / 面板预览区固定 / 翻转归并视觉
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  await s.sleep(4000)
  let fail = 0
  const ok = (cond, name) => {
    console.log((cond ? '  ✓ ' : '  ✗ ') + name)
    if (!cond) fail++
  }

  // 找一张非正方形图(600x3200 长条漫图,拉伸会最明显)
  await s.ev(`(() => {
    const app = document.querySelector('#app').__vue_app__
    const store = app.config.globalProperties.$pinia._s.get('ui')
    const lib = app.config.globalProperties.$pinia.state.value.library
    const img = [...lib.byId.values()].find((x) => x.kind === 'image' && !x.missing && !x.deletedAt && x.fileName.includes('长条'))
    store.openPreview(img.id)
  })()`)
  await s.sleep(1500)
  const nat = await s.ev(`(() => {
    const img = document.querySelector('.view-img')
    return { w: img.naturalWidth, h: img.naturalHeight, styleW: img.style.width }
  })()`)
  console.log(`原图 ${nat.w}x${nat.h}`)

  // 1. 旋转:视觉比例必须 === 互换后的自然比例(不拉伸)
  const rotBtn = await s.ev(`(() => {
    const b = [...document.querySelectorAll('.viewer-toolbar .pb-btn')].find((x) => (x.title || '').startsWith('旋转'))
    const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)
  await s.click(rotBtn.x, rotBtn.y)
  await s.sleep(500)
  const rot = await s.ev(`(() => {
    const img = document.querySelector('.view-img')
    const r = img.getBoundingClientRect()
    // 旋转 90° 后内容视觉为 swapped;元素盒仍原始比例,视觉内容区 = 盒子 rotate 后 = w,h 互换
    return { boxW: img.style.width, boxH: img.style.height, transform: img.style.transform, visW: Math.round(r.width), visH: Math.round(r.height) }
  })()`)
  // 元素盒应保持原始比例(不互换),旋转在 transform 里
  const boxW = parseFloat(rot.boxW)
  const boxH = parseFloat(rot.boxH)
  ok(Math.abs(boxW / boxH - nat.w / nat.h) < 0.02, `盒子保持原始比例(${rot.boxW}x${rot.boxH},旋转在 transform 内)`)
  ok(rot.transform.includes('rotate(90deg)'), 'transform 含 rotate(90deg)')

  // 2. 再翻转:归并为 scaleX(-1) rotate(90),仍不变形
  const flipBtn = await s.ev(`(() => {
    const b = [...document.querySelectorAll('.viewer-toolbar .pb-btn')].find((x) => (x.title || '').startsWith('水平翻转'))
    const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)
  await s.click(flipBtn.x, flipBtn.y)
  await s.sleep(400)
  const flip = await s.ev(`(() => {
    const img = document.querySelector('.view-img')
    return { transform: img.style.transform, boxW: img.style.width, boxH: img.style.height }
  })()`)
  ok(flip.transform.includes('scaleX(-1)') && flip.transform.includes('rotate(90deg)'), `翻转+旋转归并为 ${flip.transform.match(/scaleX\(-1\)|rotate\(\d+deg\)/g)?.join('+')}`)
  ok(Math.abs(parseFloat(flip.boxW) / parseFloat(flip.boxH) - nat.w / nat.h) < 0.02, '盒子比例仍为原始(不变形)')

  // 3. 点返回:应立即退回瀑布流(preview 关闭,无等待)
  const backBtn = await s.ev(`(() => {
    const b = [...document.querySelectorAll('.viewer-toolbar .pb-btn')].find((x) => (x.title || '').startsWith('返回'))
    const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)
  await s.click(backBtn.x, backBtn.y)
  await s.sleep(250)
  const closed = await s.ev(`!document.querySelector('.previewer')`)
  ok(closed, '点返回后预览立即关闭(零等待)')

  // 4. 后台写盘完成(等 3 秒查文件时间戳与宽高)
  await s.sleep(3000)
  const flushed = await s.ev(`(async () => {
    const lib = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.library
    const a = [...lib.byId.values()].find((x) => x.fileName.includes('长条'))
    const f = await window.mv.assets.get(a.id)
    return { w: f.width, h: f.height }
  })()`, true)
  ok(flushed.w === nat.h && flushed.h === nat.w, `后台写盘完成(尺寸互换 ${nat.w}x${nat.h} → ${flushed.w}x${flushed.h})`)

  // 5. 面板预览区固定高度
  const sel = await s.center('.card')
  await s.click(sel.x, sel.y)
  await s.sleep(1100)
  const panel = await s.ev(`(() => {
    const box = document.querySelector('.preview-box')
    if (!box) return null
    const r = box.getBoundingClientRect()
    const cs = getComputedStyle(box)
    const img = box.querySelector('img')
    const ics = getComputedStyle(img)
    const ir = img.getBoundingClientRect()
    return { h: Math.round(r.height), vh: cs.height, objectFit: ics.objectFit, imgFits: Math.abs(ir.width - r.width) <= 1 && Math.abs(ir.height - r.height) <= 1, loaded: img.complete && img.naturalWidth > 0 }
  })()`)
  ok(panel && parseInt(panel.vh) === panel.h && panel.h > 150, `预览区固定高度(${panel && panel.h}px,不随图片比例变化)`)
  ok(panel && panel.objectFit === 'contain' && panel.imgFits && panel.loaded, `图片 contain 完整显示(object-fit=${panel && panel.objectFit},盒内铺满不溢出)`)

  console.log(fail ? `✗ ${fail} 项未通过` : '✓ 全部通过')
  console.log('console errors:', s.errors.length)
  s.close()
  process.exit(fail || s.errors.length ? 1 : 0)
}

main().catch((e) => {
  console.error('失败:', e.message)
  process.exit(1)
})
