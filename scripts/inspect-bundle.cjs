// inspect-bundle.cjs — 解剖 bundle 中 view-img 的 style 生成代码
const fs = require('fs')
const f = fs.readdirSync('out/renderer/assets').filter((x) => x.endsWith('.js')).map((x) => 'out/renderer/assets/' + x)[0]
const s = fs.readFileSync(f, 'utf8')
const i = s.indexOf('view-img')
console.log('bundle 文件:', f)
console.log(s.slice(i - 600, i + 200))
