// trace-1386.cjs — 追踪 51/1386 拼接链的文本组成
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

const g = JSON.parse(readPngText(FILE)['prompt'].replace(/\bNaN\b/g, 'null'))

// 打印 51 与 1386 及其上游字符串节点
function show(id, depth, seen) {
  if (depth > 6 || seen.has(id)) return
  seen.add(id)
  const n = g[id]
  if (!n) {
    console.log('  '.repeat(depth) + `#${id} (不存在)`)
    return
  }
  const strs = Object.entries(n.inputs || {})
    .filter(([k, v]) => typeof v === 'string' && v.trim())
    .map(([k, v]) => `${k}="${String(v).slice(0, 70)}"`)
  const links = Object.entries(n.inputs || {})
    .filter(([, v]) => Array.isArray(v))
    .map(([k, v]) => `${k}→${v[0]}`)
  console.log('  '.repeat(depth) + `#${id} ${n.class_type} ${links.join(' ')} ${strs.join(' ')}`)
  for (const [, v] of Object.entries(n.inputs || {})) {
    if (Array.isArray(v)) show(String(v[0]), depth + 1, seen)
  }
}
console.log('=== #51 正向编码节点链 ===')
show('51', 0, new Set())
