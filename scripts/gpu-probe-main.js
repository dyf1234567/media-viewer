// gpu-probe-main.js — GPU 状态探针,结果落盘(node gpu-probe-main.js [--switch...])
const { app } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const OUT = path.join(__dirname, 'gpu-result.txt')
const logLines = []

for (const a of process.argv.slice(2)) {
  if (a.startsWith('--')) {
    const eq = a.indexOf('=')
    if (eq > 0) app.commandLine.appendSwitch(a.slice(2, eq), a.slice(eq + 1))
    else app.commandLine.appendSwitch(a.slice(2))
  }
}

app.whenReady().then(async () => {
  try {
    // GPU 进程初始化需要时间,等 5 秒再读状态
    await new Promise((r) => setTimeout(r, 5000))
    const st = app.getGPUFeatureStatus()
    logLines.push('=== FeatureStatus ===')
    for (const [k, v] of Object.entries(st)) logLines.push(`${k}: ${v}`)
    const info = await app.getGPUInfo('complete')
    logLines.push('=== gpuDevice ===')
    logLines.push(JSON.stringify(info.gpuDevice || [], null, 1))
  } catch (e) {
    logLines.push('异常: ' + e.message)
  }
  fs.writeFileSync(OUT, logLines.join('\n'))
  app.quit()
})
