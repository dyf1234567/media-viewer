// qa-eagle.cjs — Eagle 化筛选 UI + 性能 CSS + 色系迁移 实测
// 用法: node scripts/qa-eagle.cjs (需 9222 调试实例已启动)
const { session } = require('./cdp.cjs')
const os = require('os')
const path = require('path')

async function main() {
  const s = await session()
  const log = (...a) => console.log(...a)
  let fail = 0
  const ok = (cond, name) => {
    log(cond ? '  ✓ ' + name : '  ✗ ' + name)
    if (!cond) fail++
  }

  // 0. 迁移效果用行为验证(node 侧 better-sqlite3 是 Electron ABI,无法直查):稍后筛选蓝色看是否命中
  log('— 色系迁移(行为验证见下) —')

  await s.reload()
  await s.sleep(1500)

  // 1. 筛选行形态
  log('— 筛选行 —')
  const row = await s.ev(`(() => {
    const btns = [...document.querySelectorAll('.filterbar .dim-btn')]
    return {
      n: btns.length,
      labels: btns.map((b) => b.textContent.trim().replace(/\\s+/g, '')),
      ring: !!document.querySelector('.filterbar .hue-ring'),
      pill: btns.length ? getComputedStyle(btns[0]).backgroundColor : ''
    }
  })()`)
  ok(row.n === 5, `常驻标签 4 个 + 更多 = 5 (实际 ${row.n}: ${row.labels})`)
  ok(row.ring, '颜色维度显示彩虹圆环')
  ok(row.pill === 'rgba(0, 0, 0, 0)', '标签为透明底(非药丸)')

  // 2. 颜色色板弹层(渲染顺序: 格式/形状/颜色/评分/更多)
  const before = await s.ev(`document.querySelectorAll('.card').length`)
  const colorBtn = await s.center('.filterbar .dim-btn:nth-child(3)')
  await s.click(colorBtn.x, colorBtn.y)
  await s.sleep(350)
  const sw = await s.ev(`(() => {
    const grid = document.querySelector('.swatch-grid')
    const items = [...document.querySelectorAll('.swatch')]
    const pop = document.querySelector('.popover')
    return {
      grid: !!grid,
      n: items.length,
      names: items.map((i) => i.textContent.trim()),
      popBg: pop ? getComputedStyle(pop).backgroundColor : '',
      popR: pop ? getComputedStyle(pop).borderRadius : ''
    }
  })()`)
  log('— 颜色弹层 —')
  ok(sw.grid && sw.n === 9, `色板网格 9 项 (${sw.names.join(' ')})`)
  ok(sw.popBg === 'rgb(35, 36, 45)' && sw.popR === '10px', `弹层质感 bg=${sw.popBg} r=${sw.popR}`)

  // 3. 点一个色板 → 选中环 + chip + 网格过滤生效(迁移行为验证;当前库青色系 3 张)
  const pick = await s.center('.swatch:nth-child(5)')
  await s.click(pick.x, pick.y)
  await s.sleep(400)
  const after = await s.ev(`document.querySelectorAll('.card').length`)
  const sel1 = await s.ev(`(() => {
    const sel = document.querySelector('.swatch.sel')
    const chip = [...document.querySelectorAll('.chip')].map((c) => c.textContent.trim()).find((t) => t.includes('颜色'))
    return { sel: !!sel, shadow: sel ? getComputedStyle(sel.querySelector('.sw-dot')).boxShadow.slice(0, 60) : '', chip }
  })()`)
  ok(sel1.sel, `选中色板带描边环 (${sel1.shadow})`)
  ok(!!sel1.chip, `chips 出现: ${sel1.chip}`)
  ok(after > 0 && after < before, `青色系过滤生效: ${before} → ${after} 张(迁移已重算色系)`)

  // 4. 清空本项 footer
  const footer = await s.ev(`!!document.querySelector('.pop-footer')`)
  ok(footer, '「清空本项」footer 出现')
  const f = await s.center('.pop-footer')
  await s.click(f.x, f.y)
  await s.sleep(250)
  const cleared = await s.ev(`!document.querySelector('.chip')`)
  ok(cleared, '清空本项生效(chip 消失)')

  // 5. 评分星形弹层(nth-child(4))
  const rateBtn = await s.center('.filterbar .dim-btn:nth-child(4)')
  await s.click(rateBtn.x, rateBtn.y)
  await s.sleep(350)
  const rate = await s.ev(`(() => {
    const items = [...document.querySelectorAll('.rate-item')]
    const first = items[0]
    return {
      n: items.length,
      stars: first ? first.querySelectorAll('.stars svg').length : 0,
      names: items.map((i) => i.textContent.trim())
    }
  })()`)
  ok(rate.n === 6 && rate.stars === 5, `评分 6 行 × 5 星 (${rate.names.slice(0, 3).join('/')})`)
  const r1 = await s.center('.rate-item:nth-child(2)') // 弹层内第 2 个子元素? popover-label 是第一个
  await s.click(r1.x, r1.y)
  await s.sleep(250)
  const rateChip = await s.ev(`[...document.querySelectorAll('.chip')].map((c) => c.textContent.trim()).join('|')`)
  ok(rateChip.includes('评分'), `评分 chip: ${rateChip}`)
  // 关闭弹层(点空白)
  await s.click(700, 500)
  await s.sleep(200)

  // 6. 更多筛选弹层
  const moreBtn = await s.center('.filterbar .dim-btn:nth-child(5)')
  await s.click(moreBtn.x, moreBtn.y)
  await s.sleep(300)
  const more = await s.ev(`(() => {
    const items = [...document.querySelectorAll('.popover .popover-item')]
    const label = document.querySelector('.popover .popover-label')
    return { n: items.length, first: label ? label.textContent.trim() : '', icons: items.filter((i) => i.querySelector('svg')).length }
  })()`)
  ok(more.n === 7 && more.first === '更多筛选', `更多筛选 7 项 (带图标 ${more.icons}/7)`)
  // 展开其中一个有内容的维度(添加日期,更多列表第 3 项 → 弹层内 nth-child(4))
  const subBtn = await s.center('.popover .popover-item:nth-child(4)')
  await s.click(subBtn.x, subBtn.y)
  await s.sleep(300)
  const sub = await s.ev(`(() => {
    const pop = document.querySelector('.popover')
    return { label: pop ? pop.querySelector('.popover-label').textContent.trim() : '', items: pop ? pop.querySelectorAll('.popover-item').length : 0 }
  })()`)
  ok(sub.items > 0, `子维度弹层: ${sub.label} ${sub.items} 项`)
  await s.click(700, 500)
  await s.sleep(200)

  // 7. 性能 CSS
  log('— 性能 —')
  const perf = await s.ev(`(() => {
    const orb = document.querySelector('.bg-orbs .orb')
    const card = document.querySelector('.card')
    return {
      orbFilter: orb ? getComputedStyle(orb).filter : '(无光斑层)',
      cardTrans: card ? getComputedStyle(card).transitionProperty : ''
    }
  })()`)
  ok(perf.orbFilter === 'none', `光斑无 blur 滤镜 (${perf.orbFilter})`)
  ok(!perf.cardTrans.includes('box-shadow'), `卡片过渡不含 box-shadow (${perf.cardTrans})`)

  // 8. 控制台错误
  await s.sleep(600)
  log('— 控制台 —')
  if (s.errors.length) {
    s.errors.slice(0, 6).forEach((e) => log('    ', e.kind, e.text))
    fail += s.errors.length
  } else log('  ✓ 无 console 错误 / 未捕获异常')

  log(fail ? `✗ ${fail} 项未通过` : '✓ 全部通过')
  s.close()
  process.exit(fail ? 1 : 0)
}

main().catch((e) => {
  console.error('脚本失败:', e)
  process.exit(1)
})
