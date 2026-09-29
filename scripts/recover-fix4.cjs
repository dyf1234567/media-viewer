// 按行号整行重写修复全部残留损坏行
const fs = require('fs')
const path = require('path')

// [file, lineNo(1-based), newContent]（\n 表示拆回两行）
const fixes = [
  ['FilterBar.vue', 57, '/** 下拉定义:菜单项渲染 + 选中态判断 */'],
  ['FilterBar.vue', 189, '        :title="`${c.label} — 点击移除`"'],
  ['AssetGrid.vue', 93, '/** 可视窗口裁剪(块跳跃 + 逐项检测配合 overscan) */'],
  ['AssetGrid.vue', 170, '// 框选(坐标统一用内容坐标:视口坐标 + scrollTop)'],
  ['AssetGrid.vue', 235, '  // 对话框用 DOM 探测:同一个 Esc 事件里,遮罩自己的处理器可能已把 store 状态关掉,'],
  ['AssetGrid.vue', 236, '  // 但 DOM 要等下一帧才移除,窗口级处理器仍应视为"有遮挡"而不清空选择'],
  ['AssetGrid.vue', 279, '    // 同列中找上/下一个\n    let j = i + delta'],
  ['AssetGrid.vue', 409, "// 空状态\nconst emptyKind = computed<'' | 'no-assets' | 'no-results' | 'trash-empty'>(() => {"],
  ['AssetGrid.vue', 419, '    <!-- 列表表头(固定在滚动区域之外) -->'],
  ['AssetGrid.vue', 455, '              <!-- 接近可视区才加载(v-lazy-img),加载完成前露出底层骨架 -->'],
  ['AssetGrid.vue', 493, '                <!-- 回收站卡片:尺寸 + 颜色 + 标签 + 评分 -->'],
  ['AssetGrid.vue', 540, `            <span v-if="v.asset.rating" class="row-stars">{{ '★'.repeat(v.asset.rating) }}</span>`],
  ['AssetGrid.vue', 551, '      <!-- 框选矩形(内容坐标,随内容滚动) -->'],
  ['AssetGrid.vue', 563, '      <!-- 空状态 -->'],
  ['AssetGrid.vue', 569, '        <p v-if="emptyKind === \'no-assets\'">点击上方「导入素材」或直接把图片 / 视频拖进窗口</p>'],
  ['AssetGrid.vue', 570, '        <p v-else-if="emptyKind === \'no-results\'">试试调整筛选条件或搜索关键字</p>'],
  ['AssetGrid.vue', 685, '  /* 同悬停条:不能被 z-index:1 的缩略图盖住 */'],
  ['AssetGrid.vue', 705, '  /* 缩略图(.thumb.lazy)为盖住骨架带了 z-index:1,悬停条必须更高才能接到点击 */'],
  ['BatchBar.vue', 52, "      toast.error(`已处理 ${r.ok} / ${r.total} 项${r.errors.length ? `:${r.errors[0]}` : ''}`)"],
  ['BatchBar.vue', 104, '// 回收站里的批量操作\nasync function batchRestore(): Promise<void> {'],
  ['BatchBar.vue', 120, '// 确认框打开时焦点落在取消键上:Enter 默认走取消,Esc/Tab 也随之可用\nconst trashCancelRef = ref<HTMLButtonElement | null>(null)'],
  ['BatchBar.vue', 139, '      <span class="count">已选 {{ selected.length }} 项</span>'],
  ['BatchBar.vue', 209, '    <!-- 移入回收站确认 -->'],
  ['BatchBar.vue', 219, '          <p>以下 {{ selected.length }} 个素材将移入应用回收站(之后仍可恢复或删除到系统回收站):</p>'],
  ['CompareTray.vue', 22, "    toast.error(tray.blockedReason || '凑齐 2–9 个同类型素材后可打开对比')"],
  ['DetailsPanel.vue', 174, "  toast.push('正在按文件内容搜索,请稍候…')"],
  ['DetailsPanel.vue', 204, '// 视频信息\nconst videoRows = computed(() => {'],
  ['DetailsPanel.vue', 213, "    { k: '音轨', v: v.hasAudio ? (v.audioCodec ?? '有').toUpperCase() : '无音轨' }"],
  ['DetailsPanel.vue', 225, '        <div><b>{{ stats.count }}</b><span>项</span></div>'],
  ['DetailsPanel.vue', 277, `          <span v-else class="stars-readonly">{{ full.rating ? '★'.repeat(full.rating) : '未评分' }}</span>`],
  ['DetailsPanel.vue', 336, '          <span v-if="!full.tagIds.length" class="hint-text">暂无标签</span>'],
  ['DetailsPanel.vue', 403, `          {{ full.note || '添加注释…' }}`],
  ['DetailsPanel.vue', 424, '            <p>将「{{ full?.fileName }}」移入应用回收站?之后可在回收站中恢复。</p>'],
  ['Editor.vue', 203, '          <p class="ed-hint">拖动滑杆实时预览,「应用并保存」后写入原文件并同步记录。</p>'],
  ['Editor.vue', 252, `          {{ busy ? '处理中…' : '应用并保存' }}`],
  ['Previewer.vue', 317, `        <button class="pb-btn" title="上一张(←)" :disabled="saving" @click="step(-1)">`],
  ['Previewer.vue', 320, `        <button class="pb-btn" title="下一张(→)" :disabled="saving" @click="step(1)">`],
  ['Previewer.vue', 352, `        :title="slideshow ? '停止幻灯片轮播' : '幻灯片轮播(每 3 秒自动下一张)'"`],
  ['Previewer.vue', 365, '    <!-- 保存中遮罩 -->'],
  ['VideoPlayer.vue', 28, "  // mkv/avi 大概率需要转封装,等待期间先给出对应提示\n  if (['mkv', 'avi'].includes(props.asset.ext)) state.value = 'remuxing'"],
  ['VideoPlayer.vue', 32, '    // 防止切换后的旧结果\n    if (props.asset.id !== id) return'],
  ['VideoPlayer.vue', 94, '  // 暂停中的视频同样受保护,不取消注销\n}'],
  ['VideoPlayer.vue', 159, `      <span>{{ state === 'remuxing' ? '正在转封装为可播放格式…' : '正在加载视频…' }}</span>`],
  ['CropOverlay.vue', 17, '/** 图片在舞台上的显示区域(居中 + 缩放平移) */'],
  ['CropOverlay.vue', 131, '/** 选区的像素尺寸(图像坐标) */'],
  ['CropOverlay.vue', 140, '  // 舞台坐标 → 图像坐标']
]

const byFile = {}
for (const [f, line, content] of fixes) {
  const p = path.join('src/renderer/src/components', f)
  const lines = (byFile[f] ??= fs.readFileSync(p, 'utf8').split('\n'))
  if (!lines[line - 1].includes('\uFFFD')) {
    console.log('警告: 行不含FFFD,跳过 →', f, line)
    continue
  }
  lines[line - 1] = content
}
for (const [f, lines] of Object.entries(byFile)) {
  fs.writeFileSync(path.join('src/renderer/src/components', f), lines.join('\n'))
}

// 复检
let rest = 0
for (const f of ['TitleBar.vue', 'Sidebar.vue', 'Toolbar.vue', 'FilterBar.vue', 'AssetGrid.vue', 'BatchBar.vue', 'CompareTray.vue', 'DetailsPanel.vue', 'Editor.vue', 'Previewer.vue', 'VideoPlayer.vue', 'CropOverlay.vue']) {
  const c = fs.readFileSync(path.join('src/renderer/src/components', f), 'utf8')
  const n = (c.match(/\uFFFD/g) || []).length
  if (n) {
    console.log('残留', f, n)
    c.split('\n').forEach((l, i) => { if (l.includes('\uFFFD')) console.log('  ', f, i + 1, l.trim().slice(0, 90)) })
  }
  rest += n
}
console.log('FFFD 残留:', rest)
