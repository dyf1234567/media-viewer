// 修复中文后吞闭合引号的 26 处损坏
const fs = require('fs')
const path = require('path')

const fixes = [
  ["Sidebar.vue", "label: '未分类?,", "label: '未分类',"],
  ["Sidebar.vue", "label: '未标签?,", "label: '未标签',"],
  ["Sidebar.vue", "label: '回收站?,", "label: '回收站',"],
  ["Toolbar.vue", "label: '最近修改? }", "label: '最近修改' }"],
  ["FilterBar.vue", "label: '红色系?,", "label: '红色系',"],
  ["FilterBar.vue", "label: '绿色系?,", "label: '绿色系',"],
  ["FilterBar.vue", "label: '蓝色系?,", "label: '蓝色系',"],
  ["FilterBar.vue", "label: '暖色调?,", "label: '暖色调',"],
  ["FilterBar.vue", "label: '冷色调?',", "label: '冷色调',"],
  ["FilterBar.vue", "label: '冷色调?", "label: '冷色调'"],
  ["FilterBar.vue", "label: '3 个月内? }", "label: '3 个月内' }"],
  ["FilterBar.vue", "label: '4K 及以上? }", "label: '4K 及以上' }"],
  ["FilterBar.vue", "label: '1080P 及以上? }", "label: '1080P 及以上' }"],
  ["FilterBar.vue", "label: '720P 及以上? }", "label: '720P 及以上' }"],
  ["FilterBar.vue", "label: '有注释? }", "label: '有注释' }"],
  ["FilterBar.vue", "label: '无注释?", "label: '无注释'"],
  ["FilterBar.vue", "label: '文件夹?,", "label: '文件夹',"],
  ["AssetGrid.vue", "没有符合条件的素材?/h3>", "没有符合条件的素材</h3>"],
  ["BatchBar.vue", "'部分素材移入回收站失败?)", "'部分素材移入回收站失败')"],
  ["BatchBar.vue", "存进库?        </button>", "存进库\n        </button>"],
  ["BatchBar.vue", "移入回收站?        </button>", "移入回收站\n        </button>"],
  ["CompareTray.vue", "图片与视频不能混选对比?      </div>", "图片与视频不能混选对比\n      </div>"],
  ["DetailsPanel.vue", "'移入回收站失败?)", "'移入回收站失败')"],
  ["DetailsPanel.vue", "'已找回文件?)", "'已找回文件')"],
  ["DetailsPanel.vue", "{ k: '分辨率?, v:", "{ k: '分辨率', v:"],
  ["DetailsPanel.vue", 'title="删除(移入回收站?"', 'title="删除(移入回收站)"'],
  ["Editor.vue", "'已保存到原文件?)", "'已保存到原文件')"],
  ["Editor.vue", "`已导出? ${saved}`", "`已导出 ${saved}`"],
  ["VideoPlayer.vue", "1: '加载被中断?,", "1: '加载被中断',"]
]

const byFile = {}
let ok = 0
const miss = []
for (const [f, from, to] of fixes) {
  const p = path.join('src/renderer/src/components', f)
  let c = (byFile[f] ??= fs.readFileSync(p, 'utf8'))
  if (c.includes(from)) {
    byFile[f] = c = c.split(from).join(to)
    ok++
  } else miss.push(f + ' :: ' + from.slice(0, 40))
}
for (const [f, c] of Object.entries(byFile)) fs.writeFileSync(path.join('src/renderer/src/components', f), c)
console.log('fixed', ok, '/', fixes.length)
if (miss.length) console.log(miss.join('\n'))
