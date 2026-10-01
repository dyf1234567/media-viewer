// diag-krea2.cjs — 用当前解析器测 110139
const { readAiMeta } = require('./tmp-meta.cjs')
readAiMeta('E:\\AIGC\\ComfyUI-aki-v3\\ComfyUI-aki-v3\\ComfyUI\\output\\krea\\2026-09-21\\110139_00001_.png', 'png')
  .then((m) => {
    if (!m) return console.log('null')
    console.log('来源:', m.source)
    console.log('正向:', m.prompt)
    console.log('负向:', m.negative)
    console.log('参数:', JSON.stringify(m.params))
    console.log('模型:', m.models.join(', '))
  })
  .catch((e) => console.log('异常', e.message))
