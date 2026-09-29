// 清理 Toolbar 漏斗残留
const fs = require('fs')
const p = 'src/renderer/src/components/Toolbar.vue'
let c = fs.readFileSync(p, 'utf8')
c = c.replace("import { scopeFilter, applyFilters, applySort, countFilters } from '../util/pipeline'", "import { scopeFilter, applyFilters, applySort } from '../util/pipeline'")
c = c.replace('const activeFilterCount = computed(() => countFilters(ui.filters))\n', '')
// 漏斗样式块(注释起至 badge 块尾)
const i = c.indexOf('/* 漏斗筛选按钮')
if (i >= 0) {
  const j = c.indexOf('padding: 0 3px;\n}', i)
  if (j >= 0) c = c.slice(0, i) + c.slice(j + 'padding: 0 3px;\n}'.length + 1)
}
fs.writeFileSync(p, c)
console.log('countFilters:', c.includes('countFilters'), '| filter-toggle:', c.includes('filter-toggle'), '| filter-badge:', c.includes('filter-badge'))
