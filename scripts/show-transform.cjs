// show-transform.cjs
const fs = require('fs')
const s = fs.readFileSync('src/renderer/src/components/Previewer.vue', 'utf8')
const i = s.indexOf('transformStyle')
console.log(s.slice(i - 30, i + 500))
console.log('---img 标签---')
const j = s.indexOf('view-img')
console.log(s.slice(j - 350, j + 120))
