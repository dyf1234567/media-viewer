// 生成 N 张 64x64 随机图用于基准测试
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const N = parseInt(process.argv[2] || '1000', 10)
const dir = process.argv[3] || 'C:\\Users\\17839\\Pictures\\MV-bench'
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

function noiseSvg(i) {
  // 伪随机结构(确定性,可复现):底色 + 大圆 + 小矩形
  const r1 = (i * 37) % 255
  const g1 = (i * 61) % 255
  const b1 = (i * 97) % 255
  const cx = 16 + ((i * 13) % 32)
  const cy = 16 + ((i * 29) % 32)
  return Buffer.from(
    `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" fill="rgb(${r1},${g1},${b1})"/><circle cx="${cx}" cy="${cy}" r="${8 + (i % 12)}" fill="rgb(${b1},${r1},${g1})"/><rect x="${(i * 7) % 40}" y="${(i * 11) % 40}" width="14" height="10" fill="rgb(${g1},${b1},${r1})"/></svg>`
  )
}

async function main() {
  const t0 = Date.now()
  const CONC = 16
  let done = 0
  for (let base = 0; base < N; base += CONC) {
    await Promise.all(
      Array.from({ length: Math.min(CONC, N - base) }, (_, k) => {
        const i = base + k
        return sharp(noiseSvg(i)).png().toFile(path.join(dir, `bench-${String(i).padStart(4, '0')}.png`)).then(() => done++)
      })
    )
  }
  console.log(JSON.stringify({ generated: done, ms: Date.now() - t0, dir }))
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
