// scan-multi.cjs — 扫描 ComfyUI 输出目录,找出含多组提示词/多采样器的工作流样本
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const DIR = process.argv[2] || 'E:\\AIGC\\ComfyUI-aki-v3\\ComfyUI-aki-v3\\ComfyUI\\output'

function readPngText(file) {
  const out = {}
  const buf = fs.readFileSync(file)
  let pos = 8
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    if (type === 'IEND') break
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'tEXt') {
      const z = data.indexOf(0)
      if (z > 0) out[data.toString('latin1', 0, z)] = data.toString('utf8', z + 1)
    } else if (type === 'iTXt') {
      const z = data.indexOf(0)
      if (z > 0) {
        const kw = data.toString('latin1', 0, z)
        const flags = data[z + 1]
        let rest = z + 3
        rest = data.indexOf(0, rest) + 1
        rest = data.indexOf(0, rest) + 1
        let text = data.subarray(rest)
        if (flags & 1) text = zlib.inflateSync(text)
        out[kw] = text.toString('utf8')
      }
    } else if (type === 'zTXt') {
      const z = data.indexOf(0)
      if (z > 0) out[data.toString('latin1', 0, z)] = zlib.inflateSync(data.subarray(z + 2)).toString('utf8')
    }
    pos += 12 + len
  }
  return out
}

function summarize(file) {
  const texts = readPngText(file)
  const p = texts['prompt']
  if (!p) return null
  let g
  try {
    g = JSON.parse(p)
  } catch {
    return { file, err: 'prompt JSON 解析失败' }
  }
  const nodes = Object.entries(g)
  const cls = {}
  for (const [id, n] of nodes) {
    const c = n.class_type || '?'
    cls[c] = (cls[c] || 0) + 1
  }
  const textNodes = nodes.filter(([, n]) => /cliptextencode|textencode/i.test(n.class_type || ''))
  const samplers = nodes.filter(([, n]) => /ksampler|samplercustom/i.test(n.class_type || ''))
  const combines = nodes.filter(([, n]) => /conditioning(combine|concat)/i.test(n.class_type || ''))
  const guiders = nodes.filter(([, n]) => /guider/i.test(n.class_type || ''))
  const dual = textNodes.filter(([, n]) => {
    const i = n.inputs || {}
    return 'negative_prompt' in i || 'text_neg' in i
  })
  return {
    file: path.basename(file),
    n: nodes.length,
    textN: textNodes.length,
    dualN: dual.length,
    samplerN: samplers.length,
    combineN: combines.length,
    guiders: guiders.map(([, n]) => n.class_type),
    classes: Object.keys(cls).filter((c) => /encode|combine|concat|sampler|guider|save/i.test(c))
  }
}

const files = fs
  .readdirSync(DIR)
  .filter((f) => f.toLowerCase().endsWith('.png'))
  .map((f) => path.join(DIR, f))
const rows = []
for (const f of files) {
  try {
    const s = summarize(f)
    if (s) rows.push(s)
  } catch (e) {
    rows.push({ file: path.basename(f), err: e.message })
  }
}
// 多提示词样本优先
rows.sort((a, b) => (b.textN || 0) - (a.textN || 0) || (b.samplerN || 0) - (a.samplerN || 0))
for (const r of rows.slice(0, 25)) console.log(JSON.stringify(r))
console.log('total png:', files.length, 'with prompt:', rows.length)
