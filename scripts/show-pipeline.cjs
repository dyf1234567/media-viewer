// show-pipeline.cjs
const fs = require('fs')
const s = fs.readFileSync('src/main/services/images.ts', 'utf8')
const i = s.indexOf('buildPipeline')
console.log(s.slice(Math.max(0, i - 200), i + 900))
