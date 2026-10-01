// check-ifelse.cjs — 查 1386 与相关 ifElse 节点的完整输入(是否有 boolean 缓存)
const fs = require('fs')
const zlib = require('zlib')

const FILE = 'E:\\AIGC\\ComfyUI-aki-v3\\ComfyUI-aki-v3\\ComfyUI\\output\\krea\\2026-09-21\\105710_00001_.png'

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
for (const id of ['1386', '1104:1396', '1104:1325', '1104:1332', '1104:1326', '1104:1328', '1104:1333']) {
  const n = g[id]
  if (!n) {
    console.log(`#${id} 不存在`)
    continue
  }
  console.log(`#${id} ${n.class_type} ${JSON.stringify(n.inputs, null, 0).slice(0, 300)}`)
}
// 查找所有 PrimitiveBoolean / boolean 类节点
console.log('--- boolean 类节点 ---')
for (const [id, n] of Object.entries(g)) {
  if (/boolean|switch/i.test(n.class_type)) {
    console.log(`#${id} ${n.class_type} ${JSON.stringify(n.inputs).slice(0, 160)}`)
  }
}
