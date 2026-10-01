// show-openpreview.cjs — 查看 openPreview/close 实现
const fs = require('fs')
const s = fs.readFileSync('src/renderer/src/stores/ui.ts', 'utf8')
const i = s.indexOf('openPreview')
console.log(s.slice(i - 50, i + 300))
