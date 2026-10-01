// find-git.cjs — 定位可用的 git.exe
const fs = require('fs')
const { execSync } = require('child_process')
const candidates = [
  'C:\\Program Files\\Git\\cmd\\git.exe',
  'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
  'C:\\Users\\17839\\AppData\\Local\\OpenClaw\\deps\\portable-git\\cmd\\git.exe',
  'C:\\Users\\17839\\AppData\\Local\\OpenClaw\\deps\\portable-git\\mingw64\\bin\\git.exe',
  'C:\\Users\\17839\\AppData\\Local\\Programs\\Git\\cmd\\git.exe',
  'D:\\Program Files\\Git\\cmd\\git.exe'
]
for (const p of candidates) {
  if (fs.existsSync(p)) {
    try {
      const out = execSync(`"${p}" --version`, { encoding: 'utf8' })
      console.log('可用:', p, '=>', out.trim())
    } catch (e) {
      console.log('存在但不可执行:', p)
    }
  } else {
    console.log('不存在:', p)
  }
}
// gh 自带 git?gh 在 PATH(GitHub CLI)
try {
  console.log('gh:', execSync('gh --version', { encoding: 'utf8' }).split('\n')[0])
} catch {
  console.log('gh 不可用')
}
