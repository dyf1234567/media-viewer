// check-imgel.cjs — 验证新 bundle 包含直写样式代码
const fs = require('fs')
const f = fs.readdirSync('out/renderer/assets').filter((x) => x.endsWith('.js')).map((x) => 'out/renderer/assets/' + x)[0]
const s = fs.readFileSync(f, 'utf8')
console.log('bundle:', f, 'mtime:', fs.statSync(f).mtime.toLocaleString())
console.log('含 imgEl 直写:', s.includes('imgEl'))
console.log('含 applyViewStyle:', s.includes('applyViewStyle'))
console.log('无残留 ?< 开头:', !fs.readFileSync('src/renderer/src/components/Previewer.vue', 'utf8').startsWith('?'))
