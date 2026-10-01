// patch-aimeta.cjs — AiMeta 增加 promptCandidates 字段
const fs = require('fs')
const p = 'src/shared/types.ts'
let s = fs.readFileSync(p, 'utf8')
const old = '  workflow: string | null\n  raw: string | null\n}'
if (!s.includes(old)) {
  console.log('未找到锚点')
  process.exit(1)
}
s = s.replace(
  old,
  '  workflow: string | null\n  raw: string | null\n  /** 复用工作流的多候选提示词(ShowText 缓存),运行时分支优先;面板可切换查看 */\n  promptCandidates?: string[]\n}'
)
fs.writeFileSync(p, s)
console.log('AiMeta 已扩展:', s.includes('promptCandidates'))
