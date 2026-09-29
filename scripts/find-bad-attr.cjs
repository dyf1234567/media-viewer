// 在 dev 实例注入钩子定位坏属性来源组件
const http = require('http')

function main() {
  http.get({ host: '127.0.0.1', port: 9223, path: '/json/list' }, (r) => {
    let d = ''
    r.on('data', (c) => (d += c))
    r.on('end', async () => {
      const t = JSON.parse(d).find((x) => x.type === 'page')
      const w = new WebSocket(t.webSocketDebuggerUrl)
      let id = 0
      const pending = new Map()
      w.addEventListener('message', (e) => {
        const msg = JSON.parse(e.data)
        if (msg.id && pending.has(msg.id)) {
          pending.get(msg.id)(msg.result)
          pending.delete(msg.id)
        }
      })
      const send = (method, params = {}) =>
        new Promise((res) => {
          const i = ++id
          pending.set(i, res)
          w.send(JSON.stringify({ id: i, method, params }))
        })
      w.addEventListener('open', async () => {
        await send('Runtime.enable')
        await send('Page.enable')
        await send('Page.addScriptToEvaluateOnNewDocument', {
          source: `
            window.__badAttrs = []
            const orig = Element.prototype.setAttribute
            Element.prototype.setAttribute = function(name, ...rest) {
              if (/[?\\uFFFD]/.test(String(name))) {
                window.__badAttrs.push({ tag: this.tagName, name: String(name), stack: new Error().stack })
              }
              return orig.call(this, name, ...rest)
            }
          `
        })
        await send('Page.reload')
        await new Promise((r) => setTimeout(r, 4000))
        const r = await send('Runtime.evaluate', {
          expression: 'JSON.stringify((window.__badAttrs||[]).slice(0,2))',
          returnByValue: true
        })
        const arr = JSON.parse(r.result.value || '[]')
        for (const a of arr) {
          console.log('TAG:', a.tag, 'ATTR:', JSON.stringify(a.name))
          console.log(a.stack.split('\n').filter((l) => !/node_modules|<anonymous>/.test(l)).slice(0, 15).join('\n'))
          console.log('--- full head ---')
          console.log(a.stack.split('\n').slice(0, 30).join('\n'))
        }
        if (!arr.length) console.log('无坏属性捕获, app=', r2)
        w.close()
        process.exit(0)
      })
    })
  })
}
main()
