// 清理引号/中文标点后残留的孤立问号(编码事故尾巴)
const fs = require('fs')
const path = require('path')

let n = 0
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name.endsWith('.vue')) {
      const lines = fs.readFileSync(p, 'utf8').split('\n')
      let changed = false
      lines.forEach((l, i) => {
        // 场景1: 中文/右括号/引号后跟 ? 再跟空白或 < (吞字尾巴)
        // 场景2: 属性值闭合引号后跟孤立 ? 再跟空白/>(另一个被吞的引号)
        let cleaned = l
        if (/"\s*\?(?=[\s>])/.test(cleaned)) {
          cleaned = cleaned.replace(/"\s*\?(?=[\s>])/, '"')
        } else if (/[\u4e00-\u9fff)\]」”]\?+(?=\s*$)/.test(cleaned) && /="/.test(cleaned) === false && /^(\s*)[<{]/.test(l) === false) {
          // 文本行尾的孤立?(如 "退出随机浏览?")— 不动,可能语义正常
        }
        if (cleaned !== l) {
          console.log('FIX', p.replace(/.*components./, ''), i + 1, '→', cleaned.trim().slice(0, 80))
          lines[i] = cleaned
          n++
          changed = true
        }
      })
      if (changed) fs.writeFileSync(p, lines.join('\n'))
    }
  }
}
walk('src/renderer/src')
console.log('fixed:', n)
