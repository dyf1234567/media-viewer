// check-back.cjs
const { session } = require('./cdp.cjs')
async function main() {
  const s = await session()
  await s.reload()
  await s.sleep(2000)
  const r = await s.ev(`(() => {
    const b = document.querySelector('.pb-back')
    const all = [...document.querySelectorAll('.viewer-toolbar .pb-btn')].map((x) => x.title)
    return { back: b ? b.className + '|' + b.textContent.trim() : '无 pb-back', titles: all.slice(0, 6) }
  })()`)
  console.log(JSON.stringify(r, null, 1))
  s.close()
}
main().catch((e) => { console.error(e.message); process.exit(1) })
