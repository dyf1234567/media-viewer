// find-natural.cjs — 找出 natural 的重复声明
const fs = require('fs')
const s = fs.readFileSync('src/renderer/src/components/Previewer.vue', 'utf8')
const lines = s.split('\n')
lines.forEach((l, i) => {
  if (/const natural|let natural|var natural/.test(l)) {
    console.log(`行 ${i + 1}: ${l.trim()}`)
  }
})
