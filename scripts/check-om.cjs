// check-om.cjs — 检查 bundle 是否包含 onMounted 兜底
const fs = require('fs')
const f = fs.readdirSync('out/renderer/assets').filter((x) => x.endsWith('.js')).map((x) => 'out/renderer/assets/' + x)[0]
const s = fs.readFileSync(f, 'utf8')
const i = s.indexOf('onMounted(() => {')
console.log('onMounted 块:', JSON.stringify(s.slice(i, i + 300)))
console.log('构建时间:', fs.statSync(f).mtime.toISOString())
