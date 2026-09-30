// inspect-null.cjs — 列出剩余解析为空的文件及其节点类
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const { parseComfyUI } = require('./tmp-meta.cjs')

const DIR = 'E:\\AIGC\\ComfyUI-aki-v3\\ComfyUI-aki-v3\\ComfyUI\\output'

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

for (const f of fs.readdirSync(DIR).filter((f) => f.toLowerCase().endsWith('.png'))) {
  let t
  try {
    t = readPngText(path.join(DIR, f))
  } catch {
    continue
  }
  if (!t['prompt']) continue
  const m = parseComfyUI(t['prompt'], t['workflow'] ?? null)
  if (!m.prompt) {
    const g = JSON.parse(t['prompt'])
    const cls = [...new Set(Object.values(g).map((n) => n.class_type))]
    console.log(f, '=>', cls.slice(0, 12).join(', '))
  }
}
