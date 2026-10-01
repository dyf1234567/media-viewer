// find-dup.cjs — 找 Previewer.vue 中的重复声明
const fs = require('fs')
const s = fs.readFileSync('src/renderer/src/components/Previewer.vue', 'utf8')
const lines = s.split('\n')
const seen = {}
lines.forEach((l, i) => {
  const m = /^(?:function|const|let)\s+([A-Za-z_$][\w$]*)/.exec(l.trim())
  if (m) {
    const name = m[1]
    if (!seen[name]) seen[name] = []
    seen[name].push(i + 1)
  }
})
for (const [name, ls] of Object.entries(seen)) {
  if (ls.length > 1) console.log(`重复: ${name} 出现于行 ${ls.join(', ')}`)
}
console.log('总行数:', lines.length)
