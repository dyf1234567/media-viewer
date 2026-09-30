// qa-details.cjs — 点击卡片,验证详情面板 AI 生成参数区显示解析结果
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  await s.sleep(1000)
  // 虚拟滚动可能未渲染目标卡片:先按文件名搜索过滤
  await s.ev(`(() => {
    const app = document.querySelector('#app').__vue_app__
    app.config.globalProperties.$pinia.state.value.ui.search = 'Qwen'
    return true
  })()`)
  await s.sleep(600)
  // 找到 Qwen 卡片并点击
  const pos = await s.ev(`(() => {
    const cards = [...document.querySelectorAll('.card')]
    const c = cards.find((x) => (x.querySelector('.card-name') ? x.querySelector('.card-name').textContent : '').includes('Qwen'))
    if (!c) return null
    const r = c.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)
  if (!pos) {
    console.log('✗ 未找到 Qwen 卡片')
    process.exit(1)
  }
  await s.click(pos.x, pos.y)
  await s.sleep(1200)
  const r = await s.ev(`(() => {
    const panel = document.querySelector('.details-panel, .panel, aside')
    const text = panel ? panel.textContent : ''
    const hasAi = /AI 生成参数|提示词/.test(text)
    const m = text.indexOf('Greyscale fashion') >= 0 ? 'Greyscale fashion…命中' : null
    const hasNeg = /负向|Negative/.test(text)
    const model = text.match(/minimax|qwen|sdxl|flux/i)
    return { hasAi, prompt: m, hasNeg, model: model ? model[0] : null, len: text.length }
  })()`)
  console.log(JSON.stringify(r))
  const okCount = [r.hasAi, r.prompt, r.model].filter(Boolean).length
  console.log(okCount >= 2 ? '✓ 详情面板 AI 参数正常' : '✗ 详情面板未显示 AI 参数')
  console.log('errors:', s.errors.length)
  s.close()
  process.exit(okCount >= 2 && s.errors.length === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('失败:', e.message)
  process.exit(1)
})
