// check-css2.cjs — 查面板预览 CSS 在 bundle 中的实际规则
const fs = require('fs')
const f = fs.readdirSync('out/renderer/assets').filter((x) => x.endsWith('.css')).map((x) => 'out/renderer/assets/' + x)[0]
const s = fs.readFileSync(f, 'utf8')
const i = s.indexOf('.preview-box img')
console.log('bundle:', f)
console.log(JSON.stringify(s.slice(i - 10, i + 300)))
