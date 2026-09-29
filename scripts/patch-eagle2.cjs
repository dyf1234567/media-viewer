// 补丁2:列表行角标 + showInFolder IPC + preload + 视图切换过渡
const fs = require('fs')

let n = 0
function patchFile(p, pairs) {
  let c = fs.readFileSync(p, 'utf8')
  for (const [from, to, tag] of pairs) {
    if (!c.includes(from)) {
      console.log('MISS:', p, tag)
      continue
    }
    c = c.split(from).join(to)
    n++
    console.log('OK:', tag)
  }
  fs.writeFileSync(p, c)
}

// 1. 列表行角标
patchFile('src/renderer/src/components/AssetGrid.vue', [
  [
    `          @contextmenu="cardContextMenu(v.asset, $event)"
        >
          <div class="cell thumb-cell">
            <template v-if="!v.asset.missing && v.asset.thumbDone === 1">`,
    `          @contextmenu="cardContextMenu(v.asset, $event)"
        >
          <div class="check-badge row-check" aria-hidden="true"><Icon name="check" :size="12" /></div>
          <div class="cell thumb-cell">
            <template v-if="!v.asset.missing && v.asset.thumbDone === 1">`,
    'row-badge'
  ],
  // 2. 视图切换淡入淡出
  [
    `      <!-- 瀑布流 -->
      <div
        v-if="ui.viewMode === 'waterfall' && items.length"
        class="wf-canvas"`,
    `      <!-- 瀑布流 -->
      <div
        v-if="ui.viewMode === 'waterfall' && items.length"
        key="wf"
        class="wf-canvas view-fade"`,
    'wf-key'
  ]
])

// 3. 主进程 IPC:资源管理器定位
patchFile('src/main/ipc.ts', [
  [
    `  ipcMain.handle('assets:exportBatch', (_e, args: { ids: number[]; opts: ExportOptions }) =>
    exportAssets(args.ids, args.opts)
  )`,
    `  ipcMain.handle('assets:exportBatch', (_e, args: { ids: number[]; opts: ExportOptions }) =>
    exportAssets(args.ids, args.opts)
  )
  ipcMain.handle('assets:showInFolder', (_e, id: number) => {
    const row = getAssetRow(id)
    if (!row) throw new Error('素材不存在')
    shell.showItemInFolder(row.file_path)
  })`,
    'ipc-showInFolder'
  ],
  [
    `import { relocateAsset } from './services/relocate'`,
    `import { shell } from 'electron'
import { relocateAsset } from './services/relocate'`,
    'ipc-shell-import'
  ]
])

// 4. preload
patchFile('src/preload/index.ts', [
  [
    `    exportBatch(
      ids: number[],
      opts: { dir: string; mode: 'copy' | 'convert'; format?: 'png' | 'jpg' | 'webp'; quality?: number }
    ): Promise<{ ok: number; total: number; files: string[]; errors: string[] }>
  }`,
    `    exportBatch(
      ids: number[],
      opts: { dir: string; mode: 'copy' | 'convert'; format?: 'png' | 'jpg' | 'webp'; quality?: number }
    ): Promise<{ ok: number; total: number; files: string[]; errors: string[] }>
    showInFolder(id: number): Promise<void>
  }`,
    'preload-type'
  ],
  [
    `    exportBatch: (ids, opts) => ipcRenderer.invoke('assets:exportBatch', { ids: plain(ids), opts }),`,
    `    exportBatch: (ids, opts) => ipcRenderer.invoke('assets:exportBatch', { ids: plain(ids), opts }),
    showInFolder: (id) => ipcRenderer.invoke('assets:showInFolder', id),`,
    'preload-impl'
  ]
])

console.log('patched:', n)
