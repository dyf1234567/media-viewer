// 第二轮:AMBIG 取最短候选补全;打印全部残留 FFFD 行供人工处理
const fs = require('fs')
const path = require('path')

const outDir = 'out/renderer/assets'
const bundle = fs.readdirSync(outDir).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(outDir, f), 'utf8')).join('\n')
const cand = [...new Set(bundle.match(/[\u4e00-\u9fff][\u4e00-\u9fffA-Za-z0-9 ,:：,，.。·×%()（）\/\\-]{0,28}/g) || [])]

const files = [
  'TitleBar.vue', 'Sidebar.vue', 'Toolbar.vue', 'FilterBar.vue', 'AssetGrid.vue', 'BatchBar.vue',
  'CompareTray.vue', 'DetailsPanel.vue', 'Editor.vue', 'Previewer.vue', 'VideoPlayer.vue', 'CropOverlay.vue'
]

let auto2 = 0
const remain = []
for (const f of files) {
  const p = path.join('src/renderer/src/components', f)
  const lines = fs.readFileSync(p, 'utf8').split('\n')
  const out = lines.map((line, i) => {
    if (!line.includes('\uFFFD')) return line
    const fixed = line.replace(/([\u4e00-\u9fff]{1,10})\uFFFD+/g, (m, pre) => {
      const hits = cand.filter((c) => c.startsWith(pre) && c.length > pre.length)
      if (hits.length >= 1) {
        hits.sort((a, b) => a.length - b.length)
        const rest = hits[0].slice(pre.length).match(/^[\u4e00-\u9fff]{1,2}/)
        if (rest) {
          auto2++
          return pre + rest[0]
        }
      }
      return m
    })
    if (fixed.includes('\uFFFD')) remain.push(`${f}:${i + 1}: ${fixed.trim().slice(0, 110)}`)
    return fixed
  })
  fs.writeFileSync(p, out.join('\n'))
}
console.log('第二轮自动:', auto2)
console.log('剩余人工:', remain.length)
console.log(remain.join('\n'))
