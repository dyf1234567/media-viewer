// dbg-lazy3.cjs — IO 对照实验 + 找滚动容器样式
const { session } = require('./cdp.cjs')
async function main() {
  const s = await session()
  await s.ev(`(() => { document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.ui.viewMode = 'list' })()`)
  await s.sleep(1000)
  const r = await s.ev(`(async () => {
    const img = document.querySelector('.thumb-cell img')
    // 对照:新建 IO 观察同一元素
    let fired = false
    let ratio = -1
    const io2 = new IntersectionObserver((es) => { fired = true; ratio = es[0].intersectionRatio }, { rootMargin: '400px 0px' })
    io2.observe(img)
    await new Promise((r2) => setTimeout(r2, 500))
    io2.disconnect()
    // 向上找滚动容器
    let n = img
    const chain = []
    while (n && n !== document.body && chain.length < 8) {
      n = n.parentElement
      if (!n) break
      const cs = getComputedStyle(n)
      chain.push({ cls: (n.className || n.tagName).toString().slice(0, 26), overflow: cs.overflowY, contain: cs.contain, cv: cs.contentVisibility, transform: cs.transform !== 'none' })
    }
    return { fired, ratio, chain }
  })()`, true)
  console.log(JSON.stringify(r, null, 1))
  s.close()
}
main().catch((e) => { console.error(e.message); process.exit(1) })
