// report-key.cjs — 对关键问题图片逐张打印提取结果
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const { parseComfyUI } = require('./tmp-meta.cjs')

const DIR = 'E:\\AIGC\\ComfyUI-aki-v3\\ComfyUI-aki-v3\\ComfyUI\\output'
const KEYS = [
  'Qwen_image_2.1_00007.png',
  'Qwen_image_2.1_00017.png',
  'Qwen_image_2.1_00018.png',
  'Qwen_image_2.1_00020.png',
  'Qwen_image_2.1_00021.png',
  'AnimateDiff_00022.png',
  'AnimateDiff_00023.png',
  'ComfyUI_02919_.png',
  'ComfyUI_00004_.png',
  '镜-01-fb27f07f_00004_.png',
  'ComfyUI_00085_.png',
  '巷口回望-9cf749e3_00001_.png'
]

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

for (const key of KEYS) {
  const f = path.join(DIR, key)
  if (!fs.existsSync(f)) {
    console.log(`✗ ${key} 文件不存在`)
    continue
  }
  const texts = readPngText(f)
  if (!texts['prompt']) {
    console.log(`✗ ${key} 无 prompt 块`)
    continue
  }
  const m = parseComfyUI(texts['prompt'], texts['workflow'] ?? null)
  const lines = m.prompt ? m.prompt.split('\n').filter((l) => l.trim()).length : 0
  const p = (m.prompt || '').replace(/\s+/g, ' ').slice(0, 70)
  const n = m.negative ? m.negative.replace(/\s+/g, ' ').slice(0, 50) : '(空)'
  const ps = Object.entries(m.params || {}).map(([k, v]) => `${k}=${v}`).join(' ')
  console.log(`✓ ${key}`)
  console.log(`    正向(${lines}段): ${p}${m.prompt && m.prompt.length > 70 ? '…' : ''}`)
  console.log(`    负向: ${n}`)
  console.log(`    参数: ${ps || '(无)'}  模型: ${(m.models || []).join(', ') || '(无)'}`)
}
