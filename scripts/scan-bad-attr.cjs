// 扫描 .vue 模板中损坏成 ? 的属性名
const fs = require('fs')
const path = require('path')

function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name.endsWith('.vue')) {
      const lines = fs.readFileSync(p, 'utf8').split('\n')
      lines.forEach((l, i) => {
        const t = l.trim()
        if (/^(\/\/|\/\*|\*)/.test(t)) return
        // 属性位置出现 ?: 空格+?+= 或 ="? 开头的值
        if (/\s\?+=/.test(l) || /="?\s+[a-z:@-]+=/.test(l) || /\s\?\s+[a-z:@-]+="/.test(l)) {
          console.log(p.replace(/.*[\\/]components[\\/]/, '') + '#' + (i + 1) + '# ' + t.slice(0, 100))
        }
      })
    }
  }
}
walk('src/renderer/src')
