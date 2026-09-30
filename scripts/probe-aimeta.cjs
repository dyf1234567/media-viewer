// probe-aimeta.cjs — 端到端:启动后检查资产 AI 元数据解析结果(policy v4 重析)
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  await s.sleep(8000) // 等启动维护跑完 upgradeAiMeta 的限流重读
  const r = await s.ev(`(() => {
    const app = document.querySelector('#app').__vue_app__
    const lib = app.config.globalProperties.$pinia.state.value.library
    const arr = [...lib.byId.values()]
    return arr.map((a) => ({
      name: a.fileName,
      hasAi: !!a.aiMeta,
      prompt: a.aiMeta?.prompt ? a.aiMeta.prompt.slice(0, 60) : null,
      promptLines: a.aiMeta?.prompt ? a.aiMeta.prompt.split('\\n').filter((l) => l.trim()).length : 0,
      neg: a.aiMeta?.negative ? a.aiMeta.negative.slice(0, 40) : null,
      negEqPrompt: !!(a.aiMeta?.negative && a.aiMeta.negative === a.aiMeta.prompt),
      params: a.aiMeta?.params ? Object.keys(a.aiMeta.params).length : 0
    }))
  })()`)
  let bad = 0
  for (const a of r) {
    console.log(JSON.stringify(a))
    if (a.negEqPrompt) bad++
  }
  console.log(`共 ${r.length} 个资产, 负向==正向误报 ${bad}, errors=${s.errors.length}`)
  s.close()
  process.exit(bad || s.errors.length ? 1 : 0)
}

main().catch((e) => {
  console.error('失败:', e.message)
  process.exit(1)
})
