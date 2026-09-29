// 编码事故总修复:56 处残留乱码精确替换(\uFFFD 为损坏占位)
const fs = require('fs')
const path = require('path')
const R = '\uFFFD'

// [file, from, to]
const fixes = [
  // ---- Toolbar ----
  ['Toolbar.vue', `title="随机打乱当前范围素材,取前 50 张浏${R}`, 'title="随机打乱当前范围素材,取前 50 张浏览"'],
  ['Toolbar.vue', `placeholder="搜索文件名${R}`, 'placeholder="搜索文件名…"'],
  // ---- FilterBar ----
  ['FilterBar.vue', `label: '★★★★${R}`, `label: '★★★★★'`],
  ['FilterBar.vue', `label: '★★${R}`, `label: '★★★'`],
  ['FilterBar.vue', `{ v: 1, label: '${R}`, `{ v: 1, label: '★'`],
  ['FilterBar.vue', `菜单项渲${R}+ 选中态判${R}*/`, '菜单项渲染 + 选中态判断 */'],
  ['FilterBar.vue', '`${c.label} ${R}点击移除`', '`${c.label} — 点击移除`'],
  // ---- AssetGrid ----
  ['AssetGrid.vue', `可视窗口裁剪(块跳${R}+ 逐项检${R}配合 overscan)`, '可视窗口裁剪(块跳跃 + 逐项检测配合 overscan)'],
  ['AssetGrid.vue', `选择与交${R}`, '选择与交互'],
  ['AssetGrid.vue', `框选放${R}坐标统一用内容坐${R}视口坐标 + scrollTop)`, '框选(坐标统一用内容坐标:视口坐标 + scrollTop)'],
  ['AssetGrid.vue', `对话框用 DOM 探测:同一${R}Esc 事件${R}遮罩自己的处理器可能已把 store 状态关${R}`, '对话框用 DOM 探测:同一个 Esc 事件里,遮罩自己的处理器可能已把 store 状态关掉,'],
  ['AssetGrid.vue', `${R} DOM 要等下一帧才移除,窗口级处理器仍应视为"有遮${R}而不清空选择`, '但 DOM 要等下一帧才移除,窗口级处理器仍应视为"有遮挡"而不清空选择'],
  ['AssetGrid.vue', `同列中找${R}下一帧?    let j = i + delta`, '同列中找上/下一个\n    let j = i + delta'],
  ['AssetGrid.vue', `// 空状${R}const emptyKind`, '// 空状态\nconst emptyKind'],
  ['AssetGrid.vue', `固定在滚动区域之${R} -->`, '固定在滚动区域之外 -->'],
  ['AssetGrid.vue', `加载完成前露出底层骨${R}-->`, '加载完成前露出底层骨架 -->'],
  ['AssetGrid.vue', `<!-- 回收站卡${R}尺寸`, '<!-- 回收站卡片:尺寸'],
  ['AssetGrid.vue', `{{ '${R}.repeat(v.asset.rating) }}`, `{{ '★'.repeat(v.asset.rating) }}`],
  ['AssetGrid.vue', `<!-- 框选矩${R}内容坐标,随内容滚${R} -->`, '<!-- 框选矩形(内容坐标,随内容滚动) -->'],
  ['AssetGrid.vue', `<!-- 空状${R}-->`, '<!-- 空状态 -->'],
  ['AssetGrid.vue', `「导入素材${R}或直接`, '「导入素材」或直接'],
  ['AssetGrid.vue', `搜索关键${R}/p>`, '搜索关键字</p>'],
  ['AssetGrid.vue', `不能${R}z-index:1`, '不能被 z-index:1'],
  ['AssetGrid.vue', `缩略图大${R}.thumb.lazy)为盖住骨架带${R}z-index:1,悬停条必须更高才能接到点${R}*/`, '缩略图(.thumb.lazy)为盖住骨架带了 z-index:1,悬停条必须更高才能接到点击 */'],
  // ---- BatchBar ----
  ['BatchBar.vue', '已处理' + R + '${r.ok} / ${r.total} ' + R + '{r.errors.length', '已处理 ${r.ok} / ${r.total} 项${r.errors.length'],
  ['BatchBar.vue', `// 回收站里的批量操${R}async function batchRestore`, '// 回收站里的批量操作\nasync function batchRestore'],
  ['BatchBar.vue', `取消键${R}Enter 默认走取${R}Esc/Tab 也随之可${R}const trashCancelRef`, '取消键上:Enter 默认走取消,Esc/Tab 也随之可用\nconst trashCancelRef'],
  ['BatchBar.vue', `已将${R}{{ selected.length }} ${R}/span>`, '已选 {{ selected.length }} 项</span>'],
  ['BatchBar.vue', `placeholder="搜索或新建标签${R}`, 'placeholder="搜索或新建标签…"'],
  ['BatchBar.vue', `placeholder="新建相册并移入${R}`, 'placeholder="新建相册并移入…"'],
  ['BatchBar.vue', `<!-- 移入回收站确${R}-->`, '<!-- 移入回收站确认 -->'],
  ['BatchBar.vue', `移入应用回收站${R}之后仍可恢复或删除到系统回收${R}:`, '移入应用回收站(之后仍可恢复或删除到系统回收站):'],
  // ---- CompareTray ----
  ['CompareTray.vue', `凑齐 2${R} 个同类型素材后可打开对比`, '凑齐 2–9 个同类型素材后可打开对比'],
  // ---- DetailsPanel ----
  ['DetailsPanel.vue', `// 删除(带确${R}`, '// 删除(带确认)'],
  ['DetailsPanel.vue', `正在按文件内容搜索${R}请稍候${R}`, '正在按文件内容搜索,请稍候…\''],
  ['DetailsPanel.vue', `// 视频信息${R}const videoRows`, '// 视频信息\nconst videoRows'],
  ['DetailsPanel.vue', `(v.audioCodec ?? '${R}).toUpperCase() : '无音轨${R} }`, `(v.audioCodec ?? '有').toUpperCase() : '无音轨' }`],
  ['DetailsPanel.vue', `<span>${R}/span>`, '<span>项</span>'],
  ['DetailsPanel.vue', `'${R}.repeat(full.rating) : '未评分${R}`, `'★'.repeat(full.rating) : '未评分'`],
  ['DetailsPanel.vue', `class="hint-text">${R}/span>`, 'class="hint-text">暂无标签</span>'],
  ['DetailsPanel.vue', `{{ full.note || '添加注释${R} }}`, `{{ full.note || '添加注释…' }}`],
  ['DetailsPanel.vue', `移入应用回收站${R}之后可在回收站中恢复${R}/p>`, '移入应用回收站?之后可在回收站中恢复。</p>'],
  // ---- Editor ----
  ['Editor.vue', `同步记录${R}/p>`, '同步记录。</p>'],
  ['Editor.vue', `'处理中${R} : '应用并保存${R}`, `'处理中…' : '应用并保存'`],
  // ---- Previewer ----
  ['Previewer.vue', `title="上一张${R}`, 'title="上一张(←)"'],
  ['Previewer.vue', `title="下一张${R}`, 'title="下一张(→)"'],
  ['Previewer.vue', `title="下一帧${R}`, 'title="下一张(→)"'],
  ['Previewer.vue', `'停止幻灯片轮播${R} : '幻灯片轮播${R}${R}3 秒自动下一${R}'`, `'停止幻灯片轮播' : '幻灯片轮播(每 3 秒自动下一张)'`],
  ['Previewer.vue', `<!-- 保存中遮${R}-->`, '<!-- 保存中遮罩 -->'],
  ['Previewer.vue', `正在保存${R}`, '正在保存…'],
  // ---- VideoPlayer ----
  ['VideoPlayer.vue', `等待期间先给出对应提${R}  if (`, '等待期间先给出对应提示\n  if ('],
  ['VideoPlayer.vue', `// 防止切换后的旧结${R}    if (`, '// 防止切换后的旧结果\n    if ('],
  ['VideoPlayer.vue', `同样受保${R}不取消注${R}}`, '同样受保护,不取消注销\n}'],
  ['VideoPlayer.vue', `可播放格式${R} : '正在加载视频${R}`, `可播放格式…' : '正在加载视频…'`],
  // ---- CropOverlay ----
  ['CropOverlay.vue', `显示区${R}居中 + 缩放平移)`, '显示区域(居中 + 缩放平移)'],
  ['CropOverlay.vue', `像素尺${R}图像坐标${R}`, '像素尺寸(图像坐标)'],
  ['CropOverlay.vue', `舞台坐标 ${R}图像坐标`, '舞台坐标 → 图像坐标']
]

let ok = 0
const miss = []
const byFile = {}
for (const [f, from, to] of fixes) {
  const p = path.join('src/renderer/src/components', f)
  let src = (byFile[f] ??= fs.readFileSync(p, 'utf8'))
  if (src.includes(from)) {
    byFile[f] = src = src.split(from).join(to)
    ok++
  } else {
    miss.push(`${f} :: ${from.slice(0, 50)}`)
  }
}
for (const [f, src] of Object.entries(byFile)) {
  fs.writeFileSync(path.join('src/renderer/src/components', f), src)
}
console.log('修复:', ok, '/', fixes.length)
if (miss.length) console.log('未命中:\n' + miss.join('\n'))

// 残留 FFFD 总检
let rest = 0
for (const f of Object.keys(byFile)) {
  const n = (fs.readFileSync(path.join('src/renderer/src/components', f), 'utf8').match(/\uFFFD/g) || []).length
  if (n) console.log('残留', f, n)
  rest += n
}
console.log('FFFD 残留总数:', rest)
