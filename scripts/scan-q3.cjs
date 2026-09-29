// 终扫:所有以 ? 结尾且含 =(属性行)的残留
const fs = require('fs')
const path = require('path')

function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name.endsWith('.vue')) {
      fs.readFileSync(p, 'utf8').split('\n').forEach((l, i) => {
        const t = l.trim()
        if (t.endsWith('?') && /=/.test(t) && !t.startsWith('//') && !t.startsWith('*')) {
          console.log(p.replace(/.*src./, '') + '#' + (i + 1) + '# [' + t.slice(0, 90) + ']')
        }
      })
    }
  }
}
walk('src/renderer/src')
