// check-natural2.cjs
const fs = require('fs')
const s = fs.readFileSync('src/renderer/src/components/Previewer.vue', 'utf8')
const script = s.slice(0, s.indexOf('</script>'))
const re = /natural\.(\w+)/g
let m
const out = []
while ((m = re.exec(script))) {
  const line = script.slice(0, m.index).split('\n').length
  out.push(`行${line}: natural.${m[1]}`)
}
console.log(out.length ? out.join('\n') : '脚本内无裸 natural 访问')
