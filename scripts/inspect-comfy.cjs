// 解剖 ComfyUI 图的节点结构:为什么正负提示词没提取到
const fs = require('fs')
const zlib = require('zlib')

function readPngTexts(file) {
  const buf = fs.readFileSync(file)
  const out = {}
  let pos = 8
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    pos += 12 + len
    if (type === 'tEXt') {
      const z = data.indexOf(0)
      if (z > 0) out[data.toString('latin1', 0, z)] = data.toString('utf8', z + 1)
    } else if (type === 'iTXt') {
      const z = data.indexOf(0)
      if (z > 0) {
        const keyword = data.toString('latin1', 0, z)
        const flags = data[z + 1]
        let rest = z + 3
        rest = data.indexOf(0, rest) + 1
        rest = data.indexOf(0, rest) + 1
        let text = data.subarray(rest)
        if (flags & 1) text = zlib.inflateSync(text)
        out[keyword] = text.toString('utf8')
      }
    } else if (type === 'zTXt') {
      const z = data.indexOf(0)
      if (z > 0) {
        out[data.toString('latin1', 0, z)] = zlib.inflateSync(data.subarray(z + 2)).toString('utf8')
      }
    } else if (type === 'IEND') break
  }
  return out
}

const file = process.argv[2]
const texts = readPngTexts(file)
console.log('文本块键:', Object.keys(texts).map((k) => `${k}(${texts[k].length}B)`).join(', '))

for (const key of ['prompt', 'workflow']) {
  const t = texts[key]
  if (!t) continue
  let obj
  try {
    obj = JSON.parse(t)
  } catch (e) {
    console.log(`${key}: JSON 解析失败 ${e.message}`)
    continue
  }
  if (Array.isArray(obj.nodes)) {
    // workflow 格式
    console.log(`\n[workflow] ${obj.nodes.length} 节点,类型清单:`)
    const types = {}
    for (const n of obj.nodes) types[n.type] = (types[n.type] || 0) + 1
    console.log(JSON.stringify(types, null, 0))
  } else {
    // API prompt 格式
    console.log(`\n[prompt] ${Object.keys(obj).length} 节点,类型清单:`)
    const types = {}
    for (const node of Object.values(obj)) types[node.class_type] = (types[node.class_type] || 0) + 1
    console.log(JSON.stringify(types, null, 0))
    // 含 positive/negative 输入的节点详情
    for (const [id, node] of Object.entries(obj)) {
      const inp = node.inputs || {}
      if ('positive' in inp || 'negative' in inp) {
        console.log(`\n采样/引导节点 #${id} ${node.class_type}:`)
        console.log('  positive =', JSON.stringify(inp.positive).slice(0, 80))
        console.log('  negative =', JSON.stringify(inp.negative).slice(0, 80))
        console.log('  其余标量输入:', Object.entries(inp).filter(([k, v]) => !Array.isArray(v)).map(([k, v]) => `${k}=${JSON.stringify(v)}`.slice(0, 40)).join(', ').slice(0, 300))
      }
    }
    // CLIPText 类节点
    for (const [id, node] of Object.entries(obj)) {
      if (/cliptext|textencode|encode/i.test(node.class_type)) {
        const t2 = node.inputs?.text ?? node.inputs?.texts ?? node.inputs?.prompt
        console.log(`\n文本节点 #${id} ${node.class_type}: text=${typeof t2 === 'string' ? JSON.stringify(t2.slice(0, 60)) : JSON.stringify(node.inputs).slice(0, 100)}`)
      }
    }
  }
}
