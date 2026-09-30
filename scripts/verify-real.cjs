// verify-real.cjs — 用新解析器跑全部真实 ComfyUI 输出,检查回归信号
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
let noPrompt = 0
let promptNull = 0
let negEqPos = 0
let multiLine = 0
let withNeg = 0
const samples = []
for (const f of files) {
  let texts
  try {
    texts = readPngText(f)
  } catch {
    continue
  }
  if (!texts['prompt']) {
    noPrompt++
    continue
  }
  let m
  try {
    m = parseComfyUI(texts['prompt'], texts['workflow'] ?? null)
  } catch (e) {
    console.log('PARSE THROW', path.basename(f), e.message)
    continue
  }
  if (!m.prompt) promptNull++
  if (m.negative) {
    withNeg++
    if (m.negative === m.prompt) {
      negEqPos++
      if (samples.length < 5) samples.push({ f: path.basename(f), issue: '负向==正向' })
    }
  }
  if (m.prompt && m.prompt.includes('\n')) multiLine++
  if (/ComfyUI_02919_|ComfyUI_00004_|镜-01-fb27f07f_00004_/.test(path.basename(f)) && samples.length < 8) {
    samples.push({
      f: path.basename(f),
      prompt: (m.prompt || '').slice(0, 50),
      neg: m.negative ? m.negative.slice(0, 50) : null,
      params: m.params
    })
  }
}
console.log(`总文件 ${files.length},无 prompt 块 ${noPrompt},prompt 解析为空 ${promptNull}`)
console.log(`有负向 ${withNeg},其中 负向==正向(误报信号) ${negEqPos},多行正向(合并收集) ${multiLine}`)
for (const s of samples) console.log(JSON.stringify(s))
