// list-targets.cjs
const http = require('http')
http.get('http://127.0.0.1:9222/json/list', (res) => {
  let d = ''
  res.on('data', (c) => (d += c))
  res.on('end', () => {
    for (const t of JSON.parse(d)) console.log(t.type, '|', t.title.slice(0, 40), '|', t.url.slice(0, 60))
  })
}).on('error', (e) => console.log('ERR', e.message))
