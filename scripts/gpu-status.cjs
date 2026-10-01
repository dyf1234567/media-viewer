// gpu-status.cjs — 查 GPU 合成状态(浏览器级 CDP)
const http = require('http')

function getJSON(path) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: 9222, path }, (r) => {
      let d = ''
      r.on('data', (c) => (d += c))
      r.on('end', () => res(JSON.parse(d)))
    }).on('error', rej)
  })
}

async function main() {
  const ver = await getJSON('/json/version')
  const ws = new WebSocket(ver.webSocketDebuggerUrl)
  await new Promise((r, j) => {
    ws.addEventListener('open', r)
    ws.addEventListener('error', j)
  })
  let seq = 0
  const pending = new Map()
  ws.addEventListener('message', (m) => {
    const msg = JSON.parse(typeof m.data === 'string' ? m.data : m.toString())
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result)
      pending.delete(msg.id)
    }
  })
  const send = (method, params = {}) =>
    new Promise((res) => {
      const id = ++seq
      pending.set(id, res)
      ws.send(JSON.stringify({ id, method, params }))
    })

  const info = await send('SystemInfo.getInfo')
  console.log('GPU 型号:', JSON.stringify(info.gpu?.devices))
  const features = info.gpuFeatureStatus || {}
  for (const k of ['compositing', 'webgl', 'canvas', 'rasterization', 'gpu_compositing', 'video_decode']) {
    if (features[k]) console.log(`${k}: ${features[k].status}`)
  }
  ws.close()
}

main().catch((e) => {
  console.error('失败:', e.message)
  process.exit(1)
})
