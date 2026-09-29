// 确认被旋转的素材并转回(3×R)
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  const out = {}
  out.modified = await s.ev(
    `window.mv.assets.list().then(r => r.assets.map(a => ({ n: a.fileName, imp: a.importedAt, mod: a.fileModifiedAt, skew: a.fileModifiedAt - a.importedAt })).sort((x, y) => y.skew - x.skew).slice(0, 3))`,
    true
  )

  // 打开 AI生图测试.png 的预览:先搜索定位
  const search = await s.ev(`(() => { const i = document.querySelector('input[placeholder*=搜索]'); const r = i.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } })()`)
  await s.click(search.x, search.y)
  await s.sleep(200)
  await s.send('Input.insertText', { text: 'AI生图测试' })
  await s.sleep(600)
  const c = await s.center('.card', 0)
  await s.click(c.x, c.y)
  await s.sleep(250)
  await s.key(' ', 'Space', 32)
  await s.sleep(800)
  out.previewOpen = await s.ev(`!!document.querySelector('.previewer')`)
  // 转 3 次恢复原方向
  for (let i = 0; i < 3; i++) {
    await s.key('r', 'KeyR', 82)
    await s.sleep(900)
  }
  out.done = await s.ev(`!!document.querySelector('.previewer')`)
  await s.key('Escape', 'Escape', 27)
  await s.sleep(300)
  // 清空搜索
  await s.ev(`(() => { const i = document.querySelector('input[placeholder*=搜索]'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
  out.errors = s.errors
  console.log(JSON.stringify(out, null, 1))
  s.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
