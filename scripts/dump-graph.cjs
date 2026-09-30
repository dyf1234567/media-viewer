// dump-graph.cjs — 打印一张图的节点结构(类名 + 关键输入连线)
const fs = require('fs')
const zlib = require('zlib')

const file = process.argv[2]
const buf = fs.readFileSync(file)
let pos = 8
let prompt = null
while (pos + 8 <= buf.length) {
  const len = buf.readUInt32BE(pos)
  const type = buf.toString('ascii', pos + 4, pos + 8)
  if (type === 'IEND') break
  const data = buf.subarray(pos + 8, pos + 8 + len)
  if (type === 'tEXt') {
    const z = data.indexOf(0)
    if (z > 0 && data.toString('latin1', 0, z) === 'prompt') prompt = data.toString('utf8', z + 1)
  } else if (type === 'zTXt') {
    const z = data.indexOf(0)
    if (z > 0 && data.toString('latin1', 0, z) === 'prompt') prompt = zlib.inflateSync(data.subarray(z + 2)).toString('utf8')
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
      if (kw === 'prompt') prompt = text.toString('utf8')
    }
  }
  pos += 12 + len
}
if (!prompt) {
  console.log('无 prompt 块')
  process.exit(0)
}
const g = JSON.parse(prompt)
for (const [id, n] of Object.entries(g)) {
  const links = Object.entries(n.inputs || {})
    .filter(([, v]) => Array.isArray(v))
    .map(([k, v]) => `${k}->${v[0]}${v.length > 1 ? ':' + v[1] : ''}`)
    .join(' ')
  const texts = Object.entries(n.inputs || {})
    .filter(([, v]) => typeof v === 'string' && v.trim().length > 0)
    .map(([k, v]) => `${k}="${String(v).slice(0, 40).replace(/\n/g, ' ')}"`)
    .join(' ')
  console.log(`#${id} ${n.class_type} ${links} ${texts}`)
}
