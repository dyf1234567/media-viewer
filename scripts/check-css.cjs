// check-css.cjs
const fs = require('fs')
const css = fs.readFileSync('src/renderer/src/styles/base.css', 'utf8')
let i = -1
while ((i = css.indexOf('--viewer-bg', i + 1)) >= 0) {
  console.log('---', JSON.stringify(css.slice(i - 60, i + 120)))
}
