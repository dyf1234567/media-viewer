// 本轮 Eagle 风格改造补丁:角标/动画/右键菜单/视图过渡
const fs = require('fs')
const path = 'src/renderer/src/components/AssetGrid.vue'
let c = fs.readFileSync(path, 'utf8')
let n = 0
const patch = (from, to, tag) => {
  if (!c.includes(from)) {
    console.log('MISS:', tag)
    return
  }
  c = c.split(from).join(to)
  n++
  console.log('OK:', tag)
}

// 1. 卡片对勾角标(悬停条之前)
patch(
  '            <div class="hover-bar" @mousedown.stop @click.stop>',
  '            <div class="check-badge" aria-hidden="true"><Icon name="check" :size="13" /></div>\n            <div class="hover-bar" @mousedown.stop @click.stop>',
  'card-badge'
)

// 2. 右键菜单扩充(收藏/编辑/复制路径/资源管理器)
patch(
  `        <div class="popover-item" @click="closeCtx(); cardDblClick(ctx.asset!)">
          <Icon name="eye" :size="14" /> 打开预览
        </div>`,
  `        <div class="popover-item" @click="closeCtx(); cardDblClick(ctx.asset!)">
          <Icon name="eye" :size="14" /> 打开预览
        </div>
        <div class="popover-item" @click="ctxFav">
          <Icon name="heart" :size="14" :filled="ctx.asset?.favorite" />
          {{ ctx.asset?.favorite ? '取消收藏' : '收藏' }}
        </div>
        <div v-if="ctx.asset?.kind === 'image' && !ctx.asset?.missing && !ui.isTrash" class="popover-item" @click="ctxEdit">
          <Icon name="edit" :size="14" /> 编辑图片
        </div>
        <div class="popover-item" @click="ctxCopyPath">
          <Icon name="copy" :size="14" /> 复制文件路径
        </div>
        <div class="popover-item" @click="ctxShowInFolder">
          <Icon name="folder" :size="14" /> 在资源管理器中显示
        </div>
        <div class="popover-sep" />`,
  'ctx-menu-items'
)

// 3. ctx 处理函数(挂在 closeCtx 之后)
patch(
  `function closeCtx(): void {
  ctx.open = false
}`,
  `function closeCtx(): void {
  ctx.open = false
}

function ctxFav(): void {
  const a = ctx.asset
  closeCtx()
  if (a) void toggleFav(a)
}

function ctxEdit(): void {
  const a = ctx.asset
  closeCtx()
  if (a) ui.openEditor(a.id)
}

function ctxCopyPath(): void {
  const a = ctx.asset
  closeCtx()
  if (a) void navigator.clipboard.writeText(a.filePath)
}

function ctxShowInFolder(): void {
  const a = ctx.asset
  closeCtx()
  if (a) void window.mv.assets.showInFolder(a.id)
}`,
  'ctx-handlers'
)

// 4. 卡片选中/hover 动画样式(.card 基础块替换)
patch(
  `.card {
  position: absolute;
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--panel);
  border: 1px solid var(--border);
  cursor: default;
  transition: border-color 0.12s, box-shadow 0.12s;
}
.card:hover {
  border-color: var(--border-strong);
}`,
  `.card {
  position: absolute;
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--panel);
  border: 1px solid var(--border);
  cursor: default;
  transition: border-color 0.15s, box-shadow 0.18s, transform 0.18s;
}
.card:hover {
  border-color: var(--border-strong);
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.28);
}
.card.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent), 0 4px 14px rgba(79, 124, 255, 0.22);
}
/* Eagle 式选中角标:弹性缩放出现 */
.check-badge {
  position: absolute;
  left: 8px;
  top: 8px;
  z-index: 4;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: scale(0);
  opacity: 0;
  transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.12s;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  pointer-events: none;
}
.card.selected .check-badge,
.row.selected .check-badge {
  transform: scale(1);
  opacity: 1;
}
.row-check {
  position: static;
  width: 16px;
  height: 16px;
  flex: none;
  box-shadow: none;
  align-self: center;
}
.row .check-badge svg {
  display: none;
}
.row.selected .check-badge svg {
  display: block;
}`,
  'card-anim-css'
)

fs.writeFileSync(path, c)
console.log('patched:', n)
