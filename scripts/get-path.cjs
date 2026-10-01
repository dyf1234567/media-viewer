// get-path.cjs
const { session } = require('./cdp.cjs')
async function main() {
  const s = await session()
  const r = await s.ev(`(async () => { const f = await window.mv.assets.get(1003); return f ? f.filePath : 'null' })()`, true)
  console.log(r)
  s.close()
}
main().catch((e) => { console.error(e.message); process.exit(1) })
