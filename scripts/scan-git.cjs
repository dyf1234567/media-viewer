// scan-git.cjs — 扫描工具目录找 git.exe
const fs = require('fs')
const path = require('path')
const roots = [
  'D:\\Program Files (x86)\\ZCode',
  'D:\\Program Files (x86)\\QoderCN',
  'C:\\Users\\17839\\AppData\\Local\\Programs',
  'C:\\Users\\17839\\scoop',
  'C:\\ProgramData\\chocolatey'
]
function walk(dir, depth) {
  if (depth > 4) return
  let ents
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of ents) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue
      walk(p, depth + 1)
    } else if (e.name.toLowerCase() === 'git.exe') {
      console.log('FOUND:', p)
    }
  }
}
for (const r of roots) {
  console.log('扫描', r)
  walk(r, 0)
}
console.log('完成')
