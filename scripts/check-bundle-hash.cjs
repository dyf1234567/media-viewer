// check-bundle-hash.cjs
const { session } = require('./cdp.cjs')
const fs = require('fs')
async function main() {
  const s = await session()
  await s.reload()
  await s.sleep(2000)
  const src = await s.ev(`[...document.querySelectorAll('script')].map((x) => x.src).join(',')`)
  console.log('页面加载:', src)
  const local = fs.readdirSync('out/renderer/assets').filter((f) => f.endsWith('.js'))
  console.log('磁盘上:', local.join(','))
  // 重新打开小图并读样式
  await s.ev(`(() => {
    const app = document.querySelector('#app').__vue_app__
    const store = app.config.globalProperties.$pinia._s.get('ui')
    const lib = app.config.globalProperties.$pinia.state.value.library
    const small = [...lib.byId.values()].filter((x) => x.kind === 'image' && !x.missing && !x.deletedAt).sort((a, b) => a.width * a.height - b.width * b.height)[0]
    store.openPreview(small.id)
  })()`)
  await s.sleep(1000)
  const st = await s.ev(`(() => {
    const img = document.querySelector('.view-img')
    return { size: img ? img.style.width : '', transform: img ? img.style.transform : '', pct: document.querySelector('.zoom-pct').textContent }
  })()`)
  console.log('重载后小图:', JSON.stringify(st))
  s.close()
}
main().catch((e) => { console.error(e.message); process.exit(1) })
