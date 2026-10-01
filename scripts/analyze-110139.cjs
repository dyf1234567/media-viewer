// analyze-110139.cjs — 多采样器工作流结构分析
const fs = require('fs')
const zlib = require('zlib')

const FILE = 'E:\\AIGC\\ComfyUI-aki-v3\\ComfyUI-aki-v3\\ComfyUI\\output\\krea\\2026-09-21\\110139_00001_.png'

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

const texts = readPngText(FILE)
const g = JSON.parse(texts['prompt'].replace(/\bNaN\b/g, 'null'))

// 全部采样器
console.log('=== 采样器节点 ===')
for (const [id, n] of Object.entries(g)) {
  if (/ksampler|samplercustom/i.test(n.class_type)) {
    const inp = n.inputs
    console.log(`#${id} ${n.class_type} seed=${inp.seed ?? inp.noise_seed} steps=${inp.steps} denoise=${inp.denoise} positive=${JSON.stringify(inp.positive)} negative=${JSON.stringify(inp.negative)} latent=${JSON.stringify(inp.latent_image)}`)
  }
}

// 全部保存/预览节点 + 文件名前缀
console.log('=== 保存节点 ===')
for (const [id, n] of Object.entries(g)) {
  if (/^(save|preview)/i.test(n.class_type)) {
    console.log(`#${id} ${n.class_type} prefix="${n.inputs.filename_prefix ?? ''}" images=${JSON.stringify(n.inputs.images)} video=${JSON.stringify(n.inputs.video ?? n.inputs.VIDEO ?? null)}`)
  }
}

// 保存节点回溯采样器
function backToSampler(id, depth = 0, seen = new Set()) {
  if (depth > 40 || seen.has(id)) return null
  seen.add(id)
  const n = g[id]
  if (!n) return null
  if (/ksampler|samplercustom/i.test(n.class_type)) return id
  const pri = ['samples', 'latent_image', 'image', 'images', 'latent', 'VIDEO', 'video']
  const keys = Object.keys(n.inputs || {})
  const ordered = [...pri.filter((k) => keys.includes(k)), ...keys.filter((k) => !pri.includes(k))]
  for (const k of ordered) {
    const v = n.inputs[k]
    if (Array.isArray(v)) {
      const r = backToSampler(String(v[0]), depth + 1, seen)
      if (r) return r
    }
  }
  return null
}

console.log('=== 保存→采样器回溯 ===')
for (const [id, n] of Object.entries(g)) {
  if (/^(save|preview)/i.test(n.class_type)) {
    const inp = n.inputs
    const via = Object.values(inp).find(Array.isArray)
    const sid = via ? backToSampler(String(via[0])) : null
    console.log(`#${id} prefix="${inp.filename_prefix ?? ''}" → sampler #${sid}`)
  }
}

// 每个采样器正负向链末端文本
function traceText(ref, dir, depth = 0, seen = new Set()) {
  if (depth > 16 || !Array.isArray(ref)) return null
  const id = String(ref[0])
  if (seen.has(id)) return null
  seen.add(id)
  const n = g[id]
  if (!n) return null
  const ct = n.class_type
  if (/cliptextencode|textencode/i.test(ct)) {
    const t = dir === 'pos' ? (inp0(n, ['prompt', 'text', 'text_pos'])) : (inp0(n, ['negative_prompt', 'negative', 'text_neg']) ?? inp0(n, ['text', 'prompt']))
    return t
  }
  if (/conditioningzeroout/i.test(ct)) return '(ZeroOut=空)'
  for (const [k, v] of Object.entries(n.inputs || {})) {
    if (Array.isArray(v) && /cond|positive|negative|prompt|text/i.test(k)) {
      const t = traceText(v, dir, depth + 1, seen)
      if (t) return t
    }
  }
  return null
}
function inp0(n, keys) {
  for (const k of keys) {
    const v = (n.inputs || {})[k]
    if (typeof v === 'string' && v.trim()) return v.slice(0, 80)
  }
  return null
}

console.log('=== 各采样器正负文本 ===')
for (const [id, n] of Object.entries(g)) {
  if (/ksampler|samplercustom/i.test(n.class_type)) {
    console.log(`#${id} 正向: ${traceText(n.inputs.positive, 'pos')}`)
    console.log(`#${id} 负向: ${traceText(n.inputs.negative, 'neg')}`)
  }
}
