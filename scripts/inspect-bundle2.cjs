// inspect-bundle2.cjs — 找 bundle 里 transformStyle 的定义
const fs = require('fs')
const f = fs.readdirSync('out/renderer/assets').filter((x) => x.endsWith('.js')).map((x) => 'out/renderer/assets/' + x)[0]
const s = fs.readFileSync(f, 'utf8')
let i = -1
let n = 0
while ((i = s.indexOf('transformStyle', i + 1)) >= 0) {
  n++
  console.log(`--- 第${n}处:`, JSON.stringify(s.slice(i - 80, i + 260)))
}
