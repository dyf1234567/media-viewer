// 安装版(9224)验证:设置页应用更新区
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
  await new Promise((r) => setTimeout(r, 6000)) // 等 5 秒启动自动检查完成

  // 打开设置
  await ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>/设置/.test(x.title||x.textContent)); b?.click(); return !!b })()`)
  await new Promise((r) => setTimeout(r, 1500))
  const out = await ev(`(() => {
    const d = document.querySelector('.dlg[aria-label=图库设置]')
    if (!d) return { open: false }
    const t = d.textContent
    return {
      open: true,
      hasVersion: /v1\\.0\\.0/.test(t),
      hasUpdateRow: t.includes('应用更新'),
      statusText: document.querySelector('.up-status')?.textContent.trim() ?? '(空)'
    }
  })()`)
  // 点一次「检查更新」(实时)
  await ev(`(() => { const d=document.querySelector('.dlg[aria-label=图库设置]'); const b=[...d.querySelectorAll('button')].find(x=>/检查更新/.test(x.textContent)); b?.click(); return true })()`)
  await new Promise((r) => setTimeout(r, 4000))
  out.afterManualCheck = await ev(`document.querySelector('.up-status')?.textContent.trim() ?? '(空)'`)
  console.log(JSON.stringify(out, null, 1))
  w.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
