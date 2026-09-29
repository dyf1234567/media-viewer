// 生成应用图标:渐变底 + 照片山形 + 播放点,512x512 PNG
const sharp = require('sharp')
const fs = require('fs')
const path = require('path')

fs.mkdirSync(path.join(__dirname, '..', 'build'), { recursive: true })

const svg = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#4f7cff"/>
      <stop offset="100%" stop-color="#8e2de2"/>
    </linearGradient>
    <linearGradient id="mount1" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#eaf2ff"/>
      <stop offset="100%" stop-color="#b9ccf5"/>
    </linearGradient>
  </defs>
  <rect x="16" y="16" width="480" height="480" rx="108" fill="url(#bg)"/>
  <rect x="88" y="108" width="336" height="296" rx="36" fill="#101018" opacity="0.35"/>
  <path d="M124 348 L216 216 L282 316 L330 252 L404 348 Z" fill="url(#mount1)"/>
  <circle cx="172" cy="176" r="28" fill="#ffd66b"/>
  <circle cx="256" cy="268" r="0" fill="none"/>
  <path d="M236 240 L292 268 L236 296 Z" fill="#ffffff" opacity="0.95"/>
</svg>`

sharp(Buffer.from(svg))
  .png()
  .toFile(path.join(__dirname, '..', 'build', 'icon.png'))
  .then((info) => console.log('icon written:', info.width + 'x' + info.height))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
