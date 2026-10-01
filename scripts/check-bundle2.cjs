// check-bundle2.cjs
const s = require('fs').readFileSync('out/main/index.js', 'utf8')
let i = -1
let n = 0
while ((i = s.indexOf('extractColors', i + 1)) >= 0) {
  n++
  console.log(`--- 第${n}处 @${i}:`, JSON.stringify(s.slice(i - 120, i + 160)))
}
