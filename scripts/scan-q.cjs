// 搜 button 标签行中的可疑问号(排除正常三元)
const fs = require('fs')
const path = require('path')

function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name.endsWith('.vue')) {
      fs.readFileSync(p, 'utf8').split('\n').forEach((l, i) => {
        if (!/<button|<Icon|:title|title=/.test(l) || !l.includes('?')) return
        // 去掉正常三元 a ? b : c
        let s = l.replace(/[?][^?:]*:[^?:]*/g, 'T')
        // 去掉字符串字面量
        s = s.replace(/'[^']*'/g, "'x'").replace(/"[^"]*"/g, '"x"')
        if (s.includes('?')) {
          console.log(p.replace(/.*components./, '') + '#' + (i + 1) + '# ' + l.trim().slice(0, 110))
        }
      })
    }
  }
}
walk('src/renderer/src')
