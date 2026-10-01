// diag-1003.cjs
const { readAiMeta } = require('./tmp-meta.cjs')
readAiMeta('C:\\Users\\17839\\Pictures\\MediaViewerLibrary\\trash\\005529_00001_.png', 'png')
  .then((m) => {
    console.log('结果:', m ? { src: m.source, prompt: (m.prompt || '').slice(0, 60), neg: m.negative ? m.negative.slice(0, 40) : null, params: Object.keys(m.params || {}).length } : null)
  })
  .catch((e) => console.log('异常', e.message))
