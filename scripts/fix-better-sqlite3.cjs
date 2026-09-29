// 修复 better-sqlite3 的 Electron ABI:npm install 默认装 Node ABI,需换成 Electron 预编译
const { execSync } = require('child_process')
const path = require('path')

const electronVersion = require('electron/package.json').version
const dir = path.join(__dirname, '..', 'node_modules', 'better-sqlite3')

try {
  execSync(`npx prebuild-install --runtime electron --target ${electronVersion}`, {
    cwd: dir,
    stdio: 'inherit'
  })
  console.log(`better-sqlite3: 已安装 Electron ${electronVersion} 预编译`)
} catch (e) {
  console.warn(
    `better-sqlite3 Electron 预编译安装失败。请手动执行:\n` +
      `  cd node_modules/better-sqlite3\n` +
      `  npx prebuild-install --runtime electron --target ${electronVersion}`
  )
}
