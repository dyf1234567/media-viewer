// 补丁3:预览器单工具栏改版(Png-Viewer 式)
const fs = require('fs')
const p = 'src/renderer/src/components/Previewer.vue'
let c = fs.readFileSync(p, 'utf8')
let n = 0

// 1. 顶部信息 → 完整工具栏开头(插入返回+弹性占位+上一张/下一张)
const from1 = `    <!-- 顶部信息 -->
    <div class="top-bar">
      <span class="pv-name" :title="asset.fileName">{{ asset.fileName }}</span>
      <span class="pv-page" v-if="playlist.length">{{ index + 1 }} / {{ playlist.length }}</span>
      <span v-if="asset.kind === 'image'" class="pv-dim">{{ natural.w }} × {{ natural.h }}</span>
    </div>

    <!-- 底部控制 -->
    <div class="bottom-bar" :class="{ disabled: saving }">
      <template v-if="asset.kind === 'image'">
        <button class="pb-btn" title="上一张(←)" :disabled="saving" @click="step(-1)">
          <Icon name="arrow-left" :size="16" />
        </button>
        <button class="pb-btn" title="下一张(→)" :disabled="saving" @click="step(1)">
          <Icon name="arrow-right" :size="16" />
        </button>
        <span class="bar-sep" />`

const to1 = `    <!-- 顶部工具栏(Png-Viewer 式单栏:返回 | 信息 | 翻页 | 缩放 | 动作) -->
    <div class="top-bar viewer-toolbar" :class="{ disabled: saving }">
      <button class="pb-btn" title="返回(Esc)" :disabled="saving" @click="close">
        <Icon name="chevron-left" :size="16" />
      </button>
      <span class="pv-name" :title="asset.fileName">{{ asset.fileName }}</span>
      <span v-if="playlist.length" class="pv-page">{{ index + 1 }} / {{ playlist.length }}</span>
      <span v-if="asset.kind === 'image'" class="pv-dim">{{ natural.w }} × {{ natural.h }}</span>
      <span class="tb-flex" />
      <template v-if="asset.kind === 'image'">
        <button class="pb-btn" title="上一张(←)" :disabled="saving" @click="step(-1)">
          <Icon name="arrow-left" :size="15" />
        </button>
        <button class="pb-btn" title="下一张(→)" :disabled="saving" @click="step(1)">
          <Icon name="arrow-right" :size="15" />
        </button>
        <span class="bar-sep" />`

if (c.includes(from1)) {
  c = c.split(from1).join(to1)
  n++
  console.log('OK: toolbar-head')
} else console.log('MISS: toolbar-head')

// 2. 底部控制尾部(轮播/全屏/关闭)→ 保持在同一工具栏,去掉底部容器
const from2 = `      <button class="pb-btn" title="关闭(Esc)" @click="close">
        <Icon name="x" :size="16" />
      </button>
    </div>

    <!-- 保存中遮罩 -->`
const to2 = `      <button class="pb-btn" title="关闭(Esc)" @click="close">
        <Icon name="x" :size="16" />
      </button>
    </div>

    <!-- 保存中遮罩 -->`
// 这段原本就相同——底部容器结束标签并入工具栏(上面 from1 的替换已把底部开头吃掉,剩余部分自然成为工具栏延续)

// 3. 样式:top-bar 改为工具栏样式 + tb-flex + 删除 bottom-bar 定位(保留类以防引用)
const from3 = `.top-bar {`
if (c.includes(from3)) {
  const i = c.indexOf(from3)
  const j = c.indexOf('}', c.indexOf('{', i))
  // 保留原 top-bar 块,追加工具栏补充样式
  const sup = `
.viewer-toolbar {
  gap: 4px;
}
.tb-flex {
  flex: 1;
}
`
  c = c.slice(0, j + 1) + sup + c.slice(j + 1)
  n++
  console.log('OK: toolbar-css')
} else console.log('MISS: toolbar-css')

fs.writeFileSync(p, c)
console.log('patched:', n)
