// clean-qmark.cjs — 清理组件文件开头残留的 "?" 字符(vue SFC 标签前的杂散字节)
const fs = require('fs')
for (const f of fs.readdirSync('src/renderer/src/components').filter((x) => x.endsWith('.vue'))) {
  const p = 'src/renderer/src/components/' + f
  let s = fs.readFileSync(p, 'utf8')
  if (s.startsWith('?<')) {
    fs.writeFileSync(p, s.slice(1))
    console.log('清理:', f)
  }
}
console.log('完成')
