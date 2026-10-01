// diag-cands.cjs — 105710 候选提示词检查
const { readAiMeta } = require('./tmp-meta.cjs')
readAiMeta('E:\\AIGC\\ComfyUI-aki-v3\\ComfyUI-aki-v3\\ComfyUI\\output\\krea\\2026-09-21\\105710_00001_.png', 'png').then((m) => {
  if (!m) return console.log('null')
  console.log('主提示词(前80):', (m.prompt || '').slice(0, 80))
  const c = m.promptCandidates || []
  console.log('候选数:', c.length)
  c.forEach((x, i) => console.log(`候选${i + 1}(前100):`, x.slice(0, 100).replace(/\n/g, ' ')))
  // 关键:候选里应有与画面匹配的(婚纱/茶室/白丝)
  const joined = c.join('') + (m.prompt || '')
  console.log('含婚纱:', joined.includes('婚纱'), '含茶室:', joined.includes('茶室'), '含白丝/连裤袜:', joined.includes('连裤袜') || joined.includes('丝袜'))
})
