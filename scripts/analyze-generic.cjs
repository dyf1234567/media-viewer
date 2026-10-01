// analyze-generic.cjs — 通用:分析指定 PNG 的多采样器/保存/文本链结构
const fs = require('fs')
const zlib = require('zlib')

const FILE = process.argv[2]

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

const g = JSON.parse(readPngText(FILE)['prompt'].replace(/\bNaN\b/g, 'null'))

console.log('=== 采样器 ===')
for (const [id, n] of Object.entries(g)) {
  if (/ksampler|samplercustom/i.test(n.class_type)) {
    const i = n.inputs
    console.log(`#${id} steps=${i.steps} denoise=${i.denoise} pos=${JSON.stringify(i.positive)} neg=${JSON.stringify(i.negative)} latent=${JSON.stringify(i.latent_image)}`)
  }
}
console.log('=== 保存节点 ===')
for (const [id, n] of Object.entries(g)) {
  if (/^(save|preview)/i.test(n.class_type)) {
    console.log(`#${id} ${n.class_type} prefix="${(n.inputs.filename_prefix || '').split('/').pop()}" img=${JSON.stringify(n.inputs.images)}`)
  }
}
// 保存回溯
function back(id, d = 0, seen = new Set()) {
  if (d > 40 || seen.has(id)) return null
  seen.add(id)
  const n = g[id]
  if (!n) return null
  if (/ksampler|samplercustom/i.test(n.class_type)) return id
  for (const v of Object.values(n.inputs || {})) {
    if (Array.isArray(v)) {
      const r = back(String(v[0]), d + 1, seen)
      if (r) return r
    }
  }
  return null
}
for (const [id, n] of Object.entries(g)) {
  if (/^save/i.test(n.class_type)) {
    const via = Object.values(n.inputs || {}).find(Array.isArray)
    console.log(`保存#${id} prefix="${(n.inputs.filename_prefix || '').split('/').pop()}" → 采样器 #${via ? back(String(via[0])) : '?'}`)
  }
}
console.log('=== 文本/LLM 节点 ===')
for (const [id, n] of Object.entries(g)) {
  if (/showtext|llm|textgenerate/i.test(n.class_type)) {
    const t = n.inputs.text_0 || n.inputs.text
    const src = Array.isArray(n.inputs.text) ? `ref->${n.inputs.text[0]}` : typeof n.inputs.text === 'string' ? 'str' : '-'
    console.log(`#${id} ${n.class_type} text(${src})="${t ? String(t).slice(0, 60) : ''}"`)
  }
}
console.log('=== 正向编码链(#51 或接 sampler positive 的编码) ===')
function show(id, d, seen) {
  if (d > 6 || seen.has(id)) return
  seen.add(id)
  const n = g[id]
  if (!n) return
  const strs = Object.entries(n.inputs || {}).filter(([, v]) => typeof v === 'string' && v.trim()).map(([k, v]) => `${k}="${String(v).slice(0, 50)}"`)
  const links = Object.entries(n.inputs || {}).filter(([, v]) => Array.isArray(v)).map(([k, v]) => `${k}→${v[0]}`)
  console.log('  '.repeat(d) + `#${id} ${n.class_type} ${links.join(' ')} ${strs.join(' ')}`)
  for (const [, v] of Object.entries(n.inputs || {})) if (Array.isArray(v)) show(String(v[0]), d + 1, seen)
}
for (const [id, n] of Object.entries(g)) {
  if (/ksampler/i.test(n.class_type) && n.inputs.positive) {
    console.log(`采样器#${id} positive 链:`)
    show(String(n.inputs.positive[0]), 0, new Set())
    break
  }
}
