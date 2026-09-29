// 端到端升级验证:安装版(1.0.0)发现 v1.0.1 → 下载 → 重启安装
const http = require('http')

function getJson(path, port) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port, path }, (r) => {
      let d = ''
      r.on('data', (c) => (d += c))
      r.on('end', () => res(JSON.parse(d)))
    }).on('error', rej)
  })
}

async function main() {
  const targets = await getJson('/json/list', 9224)
  const page = targets.find((t) => t.type === 'page')
  const w = new WebSocket(page.webSocketDebuggerUrl)
  let seq = 0
  const pending = new Map()
  w.addEventListener('message', (m) => {
    const msg = JSON.parse(typeof m.data === 'string' ? m.data : m.data.toString())
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result)
      pending.delete(msg.id)
    }
  })
  const send = (method, params = {}) =>
    new Promise((res) => {
      const id = ++seq
      pending.set(id, res)
      w.send(JSON.stringify({ id, method, params }))
    })
  const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value

  await new Promise((r) => w.addEventListener('open', r))
  await send('Runtime.enable')

  // 打开设置 → 点检查更新
  await ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>/设置/.test(x.title||x.textContent)); b?.click(); return true })()`)
  await new Promise((r) => setTimeout(r, 1200))
  await ev(`(() => { const d=document.querySelector('.dlg[aria-label=图库设置]'); if(!d) return 'no-dialog'; const b=[...d.querySelectorAll('button')].find(x=>/检查更新/.test(x.textContent)); b?.click(); return true })()`)

  // 轮询下载状态,最多 120s(安装包 ~200MB)
  let last = ''
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    last = await ev(`document.querySelector('.up-status')?.textContent.trim() ?? '(空)'`)
    if (i % 5 === 0 || /已就绪|失败|错误/.test(last)) console.log('  ' + last)
    if (/已就绪|失败|错误/.test(last)) break
  }
  console.log('FINAL:', last)

  if (/已就绪/.test(last)) {
    const ok = await ev(`window.mv.updater.install().catch(e => 'ERR:' + e.message)`)
    console.log('install 调用:', ok)
    // 等应用退出并自更新重启
    await new Promise((r) => setTimeout(r, 15000))
    // 重启后重连验证版本(应用带调试端口自启? quitAndInstall 继承参数——重新探测 9224)
    for (let t = 0; t < 10; t++) {
      try {
        const list = await getJson('/json/list', 9224)
        const p2 = list.find((x) => x.type === 'page')
        if (p2) {
          const w2 = new WebSocket(p2.webSocketDebuggerUrl)
          await new Promise((r) => w2.addEventListener('open', r))
          const ver = await new Promise((res) => {
            const id = 9001
            const onm = (m) => {
              const msg = JSON.parse(m.data)
              if (msg.id === id) {
                w2.removeEventListener('message', onm)
                res(msg.result.result.value)
              }
            }
            w2.addEventListener('message', onm)
            w2.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: `document.querySelector('.ver-label')?.textContent ?? '版本区未打开'`, returnByValue: true } }))
          })
          console.log('升级后版本:', ver)
          w2.close()
          break
        }
      } catch {
        /* 尚未重启完成 */
      }
      await new Promise((r) => setTimeout(r, 3000))
    }
  }
  w.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
