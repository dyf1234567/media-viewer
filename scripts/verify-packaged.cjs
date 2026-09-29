// 打包版最终验证:图库连续性 + sharp/ffprobe/better-sqlite3 unpacked 路径
const PAGE_WS = process.argv[2]
const ws = new WebSocket(PAGE_WS)
let msgId = 0
const pending = new Map()
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
}
function ev(code, awaitPromise = false) {
  return new Promise((resolve) => {
    const id = ++msgId
    pending.set(id, resolve)
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: code, returnByValue: true, awaitPromise } }))
  })
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function step(l, c, ap = false) {
  const m = await ev(c, ap)
  console.log(`[${l}]`, typeof m.result?.result?.value === 'string' ? m.result.result.value : JSON.stringify(m.result?.result?.value))
  return m.result?.result?.value
}
async function main() {
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  // 图库连续性:素材 10、相册 1、投票 1 轮
  await step('library', `window.mv.assets.list().then(r => JSON.stringify({ assets: r.assets.length, albums: r.albums.length, active: r.assets.filter(a => !a.deletedAt).length })).catch(e => 'ERR ' + e.message)`, true)
  // sharp(直方图)+ 主题色:对一张图计算直方图
  await step('histogram', `window.mv.meta.histogram(1, true).then(r => r ? 'OK mean=' + r.stats.l.mean + ' px=' + r.stats.l.count : 'NULL').catch(e => 'ERR ' + e.message)`, true)
  // ffprobe(视频信息)
  await step('video-info', `window.mv.video.info(5).then(r => r ? 'OK ' + r.width + 'x' + r.height + ' ' + r.videoCodec + ' ' + r.fps + 'fps' : 'NULL').catch(e => 'ERR ' + e.message)`, true)
  // 视频播放分档(ffmpeg 可执行文件不需要,但 remux 需要时可验证)
  await step('play-info', `window.mv.video.playInfo(5).then(r => 'OK tier=' + r.tier).catch(e => 'ERR ' + e.message)`, true)
  // 差值(sharp 管线)
  await step('diff', `window.mv.compare.diff(4, 9, false).then(r => 'OK ' + r.width + 'x' + r.height).catch(e => 'ERR ' + e.message)`, true)
  // 盲测战绩
  await step('score', `window.mv.compare.score(5, 10).then(r => 'OK rounds=' + r.rounds + ' a=' + r.aWins + ' b=' + r.bWins).catch(e => 'ERR ' + e.message)`, true)
  ws.close()
}
main().catch((e) => { console.error('FAIL', e.message); process.exit(1) })
