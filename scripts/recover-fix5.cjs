// 修复引号被吞的 12 处损坏行
const fs = require('fs')
const path = require('path')

const fixes = [
  ['Sidebar.vue', 111, '      <button class="nav-item" title="外观与背景" @click="ui.appearanceOpen = true">'],
  ['Toolbar.vue', 144, '          title="瀑布流视图"'],
  ['Toolbar.vue', 159, '        <button class="vt-btn" title="缩小缩略图" @click="thumbStep(-20)">'],
  ['Toolbar.vue', 168, '          title="缩略图大小"'],
  ['Toolbar.vue', 171, '        <button class="vt-btn" title="放大缩略图" @click="thumbStep(20)">'],
  ['AssetGrid.vue', 590, '          <Icon name="trash" :size="14" /> 删除(移入回收站)'],
  ['DetailsPanel.vue', 51, '// 重命名\nconst renaming = ref(false)'],
  ['DetailsPanel.vue', 271, `          <button v-if="!ui.isTrash" class="mini-btn" title="重命名" @click="startRename">`],
  ['DetailsPanel.vue', 369, `            <input v-model="newAlbumName" type="text" placeholder="新建相册并移入…" spellcheck="false" @keydown.enter="createAlbum" />`],
  ['Editor.vue', 208, `            {{ cropRect ? '重新框选' : '开始框选' }}`],
  ['Previewer.vue', 335, `        <button class="pb-btn" title="水平翻转并保存" :disabled="saving" @click="applyTransform({ flipH: true })">`],
  ['VideoPlayer.vue', 105, `    4: '不支持该视频源',`]
]

const byFile = {}
for (const [f, line, content] of fixes) {
  const lines = (byFile[f] ??= fs.readFileSync(path.join('src/renderer/src/components', f), 'utf8').split('\n'))
  lines[line - 1] = content
}
for (const [f, lines] of Object.entries(byFile)) {
  fs.writeFileSync(path.join('src/renderer/src/components', f), lines.join('\n'))
}
console.log('done', fixes.length)
