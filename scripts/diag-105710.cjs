// diag-105710.cjs — 当前解析器对 105710 的输出
const { readAiMeta } = require('./tmp-meta.cjs')
readAiMeta('E:\\AIGC\\ComfyUI-aki-v3\\ComfyUI-aki-v3\\ComfyUI\\output\\krea\\2026-09-21\\105710_00001_.png', 'png').then((m) => {
  if (!m) return console.log('null')
  console.log('正向(前400):', (m.prompt || '').slice(0, 400).replace(/\n/g, ' ⏎ '))
  console.log('正向长度:', (m.prompt || '').length)
  console.log('负向:', m.negative)
  console.log('参数:', JSON.stringify(m.params))
  console.log('模型:', m.models.join(', '))
})
