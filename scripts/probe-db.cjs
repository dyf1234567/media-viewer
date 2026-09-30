// probe-db.cjs — 绕过渲染端缓存,直接经 IPC 读数据库行的 aiMeta
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  const r = await s.ev(`(async () => {
    const app = document.querySelector('#app').__vue_app__
    const lib = app.config.globalProperties.$pinia.state.value.library
    const arr = [...lib.byId.values()]
    const out = []
    for (const a of arr) {
      if (a.kind !== 'image') continue
      const full = await window.mv.assets.get(a.id)
      out.push({ name: a.fileName, dbAi: full && full.aiMeta ? (full.aiMeta.source + '|' + String(full.aiMeta.prompt || '').slice(0, 30)) : null })
    }
    return out
  })()`, true)
  for (const x of r) console.log(JSON.stringify(x))
  const withMeta = r.filter((x) => x.dbAi).length
  console.log(`库内 ${r.length} 张图,数据库有 aiMeta: ${withMeta}`)
  s.close()
}

main().catch((e) => {
  console.error('失败:', e.message)
  process.exit(1)
})
