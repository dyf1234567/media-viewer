// 生成"横版风景.png"的重压缩近似图,供查重验证
const sharp = require('sharp')
const src = 'C:\\Users\\17839\\Pictures\\MV-测试素材\\横版风景.png'
const dst = 'C:\\Users\\17839\\Pictures\\MV-测试素材\\相似测试-压缩版.jpg'

sharp(src)
  .resize(960) // 缩到一半
  .jpeg({ quality: 38 })
  .toFile(dst)
  .then((info) => {
    console.log('生成:', dst, info.width + 'x' + info.height, info.size + 'B')
  })
  .catch((e) => {
    console.error('FAIL', e.message)
    process.exit(1)
  })
