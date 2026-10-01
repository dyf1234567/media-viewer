// check-bundle.cjs
const s = require('fs').readFileSync('out/main/index.js', 'utf8')
console.log('extractColors 出现次数:', (s.match(/extractColors/g) || []).length)
const i = s.indexOf('enqueueThumb')
console.log('enqueueThumb 上下文:', JSON.stringify(s.slice(i - 30, i + 500)))
