// find-titlebar.cjs — 查看 TitleBar 收起按钮的标记
const fs = require('fs')
const s = fs.readFileSync('src/renderer/src/components/TitleBar.vue', 'utf8')
const i = s.indexOf('toggle-sidebar')
if (i < 0) {
  console.log('未找到 toggle-sidebar')
  const j = s.indexOf('@click')
  console.log(s.slice(0, 1200))
} else {
  console.log(s.slice(i - 420, i + 140))
}
