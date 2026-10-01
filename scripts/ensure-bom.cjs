// ensure-bom.cjs — 给 update.ps1 补 UTF-8 BOM
const fs = require('fs')
for (const p of ['scripts/update.ps1', 'scripts/install-latest.ps1']) {
  const b = fs.readFileSync(p)
  if (!(b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf)) {
    fs.writeFileSync(p, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), b]))
    console.log(p, '已加 BOM')
  } else {
    console.log(p, '已有 BOM')
  }
}
