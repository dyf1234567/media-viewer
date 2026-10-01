// test-colors.cjs — 直接测 colors 模块对生成 PNG 的提取
const sharp = require('sharp')
const fs = require('fs')
const path = require('path')
const os = require('os')

async function main() {
  const tmp = path.join(os.tmpdir(), 'mv-color-direct.png')
  await sharp({
    create: { width: 320, height: 200, channels: 3, background: { r: 30, g: 144, b: 255 } }
  })
    .png()
    .toFile(tmp)
  // 用应用打包内的同一份 colors 逻辑(从 tmp-meta 不行,单独 esbuild colors)
  const { execSync } = require('child_process')
  execSync('npx esbuild src/main/services/colors.ts --bundle --platform=node --format=cjs --outfile=scripts/tmp-colors.cjs', { cwd: process.cwd(), stdio: 'pipe' })
  const { extractColors } = require('./tmp-colors.cjs')
  try {
    const c = await extractColors(tmp)
    console.log('提取结果:', JSON.stringify(c))
  } catch (e) {
    console.log('提取异常:', e.message)
  }
  fs.rmSync(tmp, { force: true })
}

main()
