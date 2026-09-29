<script setup lang="ts">
import { useUiStore } from '../stores/ui'

const ui = useUiStore()

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: '素材网格',
    items: [
      ['↑ ↓ ← → / J K', '移动选中(瀑布流按列导航),Shift 扩展选区'],
      ['Ctrl + 单击', '追加/取消单个选中'],
      ['Shift + 单击', '从锚点连选'],
      ['Ctrl + A', '全选当前范围'],
      ['空格', '打开选中素材的预览'],
      ['Delete', '移入回收站(回收站内为删除到系统回收站)'],
      ['Esc', '取消选择'],
      ['双击', '打开预览']
    ]
  },
  {
    title: '预览器',
    items: [
      ['← / →', '上一张 / 下一张'],
      ['+ / − / 0', '放大 / 缩小 / 适应窗口'],
      ['滚轮', '以光标为锚点缩放'],
      ['R', '旋转 90° 并写盘'],
      ['F', '全屏'],
      ['Esc', '退出全屏或关闭预览']
    ]
  },
  {
    title: '对比工作台',
    items: [
      ['1 / 2', '盲测投票:左胜 / 右胜'],
      ['← / →', '上一帧 / 下一帧(视频)'],
      ['空格', '播放 / 暂停(视频)'],
      ['0', '适应窗口(双图)'],
      ['Esc', '退出工作台']
    ]
  },
  {
    title: '通用',
    items: [
      ['? / F1', '打开本速查面板'],
      ['Esc', '关闭对话框'],
      ['Tab', '在对话框内循环焦点']
    ]
  }
]

function close(): void {
  ui.shortcutHelpOpen = false
}
</script>

<template>
  <Teleport to="body">
    <div class="dlg-mask" @keydown.stop @keydown.esc.stop="close" @mousedown.self="close">
      <div class="dlg shortcut-dlg" role="dialog" aria-modal="true" aria-label="快捷键速查">
        <div class="dlg-head">快捷键速查</div>
        <div class="dlg-body">
          <div v-for="g in GROUPS" :key="g.title" class="sc-group">
            <div class="sc-title">{{ g.title }}</div>
            <div v-for="([k, d], i) in g.items" :key="i" class="sc-row">
              <span class="sc-key">{{ k }}</span>
              <span class="sc-desc">{{ d }}</span>
            </div>
          </div>
        </div>
        <div class="dlg-foot">
          <button data-cancel class="btn primary" @click="close">知道了</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.shortcut-dlg {
  min-width: 480px;
  max-width: 560px;
}
.sc-group {
  margin-bottom: 14px;
}
.sc-group:last-child {
  margin-bottom: 0;
}
.sc-title {
  font-size: 12px;
  color: var(--text-faint);
  margin-bottom: 6px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 4px;
}
.sc-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 2.5px 0;
  font-size: 12.5px;
}
.sc-key {
  flex: none;
  width: 130px;
  font-family: Consolas, 'Cascadia Mono', monospace;
  font-size: 11.5px;
  color: var(--text);
  background: var(--bg-glass);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 2px 7px;
  text-align: center;
  white-space: nowrap;
}
.sc-desc {
  color: var(--text-dim);
}
</style>
