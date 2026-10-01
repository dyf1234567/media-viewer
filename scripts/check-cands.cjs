// check-cands.cjs — 验证 v9 重析后库内 ComfyUI 图有候选
const { session } = require('./cdp.cjs')
async function main() {
  const s = await session()
  await s.sleep(9000)
  const r = await s.ev(`(async () => {
    const lib = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.library
    let withCands = 0
    let comfy = 0
    let sample = null
    for (const a of [...lib.byId.values()].filter((x) => x.kind === 'image')) {
      const f = await window.mv.assets.get(a.id)
      if (f && f.aiMeta && f.aiMeta.source === 'comfyui') {
        comfy++
        if (f.aiMeta.promptCandidates && f.aiMeta.promptCandidates.length) {
          withCands++
          if (!sample) sample = { name: a.fileName, n: f.aiMeta.promptCandidates.length, first: f.aiMeta.promptCandidates[0].slice(0, 50) }
        }
      }
    }
    return { comfy, withCands, sample }
  })()`, true)
  console.log(JSON.stringify(r, null, 1))
  s.close()
}
main().catch((e) => { console.error(e.message); process.exit(1) })
