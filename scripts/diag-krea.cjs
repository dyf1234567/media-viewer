// diag-krea.cjs — 诊断 krea 子目录图解析失败原因
const fs = require('fs')
const zlib = require('zlib')
const { parseComfyUI } = require('./tmp-meta.cjs')

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
console.log('文本块:', Object.keys(texts))
const p = texts['prompt']
if (!p) {
  console.log('无 prompt 块')
  process.exit(0)
}
try {
  JSON.parse(p)
  console.log('prompt JSON 合法')
} catch (e) {
  console.log('prompt JSON 非法:', e.message.slice(0, 120))
  const i = p.indexOf('NaN')
  console.log('NaN 位置上下文:', i >= 0 ? JSON.stringify(p.slice(Math.max(0, i - 40), i + 10)) : '(无 NaN)')
}
const m = parseComfyUI(p, texts['workflow'] ?? null)
console.log('当前解析结果:', m.prompt ? `正向 ${(m.prompt || '').slice(0, 50)}` : 'null', '| 负向:', m.negative ? '有' : 'null', '| 参数数:', Object.keys(m.params).length)

// NaN 消毒后再试
const fixed = p.replace(/\bNaN\b/g, 'null')
const m2 = parseComfyUI(fixed, texts['workflow'] ?? null)
console.log('消毒后:', m2.prompt ? `正向 ${(m2.prompt || '').slice(0, 60)}` : 'null', '| 负向:', m2.negative ? (m2.negative || '').slice(0, 40) : 'null', '| 参数:', JSON.stringify(m2.params), '| 模型:', m2.models.join(','))
