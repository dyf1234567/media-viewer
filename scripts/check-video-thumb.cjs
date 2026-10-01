// check-video-thumb.cjs — 选中视频,检查详情面板预览图状态
const { session } = require('./cdp.cjs')
async function main() {
  const s = await session()
  await s.sleep(2500)
  const r = await s.ev(`(async () => {
    const app = document.querySelector('#app').__vue_app__
    const store = app.config.globalProperties.$pinia._s.get('ui')
    const lib = app.config.globalProperties.$pinia.state.value.library
    const v = [...lib.byId.values()].find((x) => x.kind === 'video')
    if (!v) return '库内无视频'
    store.detailsAssetId = v.id
    await new Promise((r2) => setTimeout(r2, 1200))
    const img = document.querySelector('.preview-box img')
    return {
      name: v.fileName,
      thumbDone: v.thumbDone,
      thumbPath: v.thumbPath,
      imgSrc: img ? img.src.slice(0, 80) : '(无 img 元素)',
      loaded: img ? img.complete && img.naturalWidth > 0 : false,
      naturalW: img ? img.naturalWidth : 0,
      boxHTML: document.querySelector('.preview-box') ? document.querySelector('.preview-box').innerHTML.slice(0, 150) : ''
    }
  })()`, true)
  console.log(JSON.stringify(r, null, 1))
  s.close()
}
main().catch((e) => { console.error('失败:', e.message); process.exit(1) })
