// 半自动修复编码事故残留:从上次成功构建产物提取中文文案,前缀匹配补全 U+FFFD
const fs = require('fs')
const path = require('path')

const outDir = 'out/renderer/assets'
const bundle = fs.readdirSync(outDir).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(outDir, f), 'utf8')).join('\n')

// 候选中文串(UI 文案,来自完好产物)
const cand = [...new Set(bundle.match(/[\u4e00-\u9fff][\u4e00-\u9fffA-Za-z0-9 ,:：,，.。·×%()（）\/\\-]{0,28}/g) || [])]

const files = [
  'TitleBar.vue', 'Sidebar.vue', 'Toolbar.vue', 'FilterBar.vue', 'AssetGrid.vue', 'BatchBar.vue',
  'CompareTray.vue', 'DetailsPanel.vue', 'Editor.vue', 'Previewer.vue', 'VideoPlayer.vue', 'CropOverlay.vue'
]

const manual = []
let autoFixed = 0

for (const f of files) {
  const p = path.join('src/renderer/src/components', f)
  let src = fs.readFileSync(p, 'utf8')
  const lines = src.split('\n')
  const outLines = []
  lines.forEach((line, li) => {
    if (!line.includes('\uFFFD')) {
      outLines.push(line)
      return
    }
    let fixed = line
    // 模式:中文前缀 + U+FFFD → 唯一候选补全
    fixed = fixed.replace(/([\u4e00-\u9fff]{1,10})\uFFFD+/g, (m, pre) => {
      const hits = cand.filter((c) => c.startsWith(pre) && c.length > pre.length)
      if (hits.length === 1) {
        // 补全候选词的剩余部分,但不超过 3 个中文字符(事故点通常只丢 1-2 字)
        const rest = hits[0].slice(pre.length).match(/^[\u4e00-\u9fff]{1,3}/)
        if (rest) {
          autoFixed++
          return pre + rest[0]
        }
      }
      if (hits.length > 1) manual.push(`${f}:${li + 1} AMBIG [${pre}] 候选: ${hits.slice(0, 4).join(' | ')}`)
      else manual.push(`${f}:${li + 1} MISS [${pre}]`)
      return m
    })
    outLines.push(fixed)
  })
  fs.writeFileSync(p, outLines.join('\n'))
}

console.log('自动补全:', autoFixed)
console.log('待人工:', manual.length)
console.log(manual.slice(0, 60).join('\n'))
