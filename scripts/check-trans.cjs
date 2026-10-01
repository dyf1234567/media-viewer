// check-trans.cjs — 查 previewer/stage/img 相关的 transition/will-change
const fs = require('fs')
const s = fs.readFileSync('src/renderer/src/components/Previewer.vue', 'utf8')
const css = s.slice(s.indexOf('<style'))
const lines = css.split('\n')
let cur = ''
lines.forEach((l, i) => {
  if (l.includes('{')) cur = l.trim()
  if (/transition|will-change|filter|backdrop/.test(l)) {
    console.log(cur, '->', l.trim())
  }
})
