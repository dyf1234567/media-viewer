// inspect-cases.cjs — 检查多行正向的构成 + 解析为空的图结构
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const { parseComfyUI } = require('./tmp-meta.cjs')

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

const files = fs.readdirSync(DIR).filter((f) => f.toLowerCase().endsWith('.png')).map((f) => path.join(DIR, f))
let shownMulti = 0
let shownNull = 0
for (const f of files) {
  let texts
  try {
    texts = readPngText(f)
  } catch {
    continue
  }
  if (!texts['prompt']) continue
  const m = parseComfyUI(texts['prompt'], texts['workflow'] ?? null)
  const base = path.basename(f)
  if (m.prompt && m.prompt.includes('\n') && shownMulti < 3) {
    shownMulti++
    console.log('=== 多行正向样本', base)
    m.prompt.split('\n').forEach((l, i) => console.log(`  [${i}] ${l.slice(0, 70)}`))
    console.log('  neg:', m.negative ? m.negative.slice(0, 60) : null)
  }
  if (!m.prompt && shownNull < 3) {
    shownNull++
    console.log('=== 解析为空样本', base)
    try {
      const g = JSON.parse(texts['prompt'])
      for (const [id, n] of Object.entries(g)) {
        console.log(`  #${id} ${n.class_type} ${Object.keys(n.inputs || {}).slice(0, 6).join(',')}`)
      }
    } catch (e) {
      console.log('  prompt JSON 解析失败:', e.message, String(texts['prompt']).slice(0, 80))
    }
  }
}
