// 导入 Qwen 图实测 Comfy 解析
const { session } = require('./cdp.cjs')

async function main() {
  const s = await session()
  await s.reload()
  await s.sleep(1800)
  const out = {}
  out.import = await s.ev(
    `window.mv.importer.run([{ path: 'E:\\\\AIGC\\\\ComfyUI-aki-v3\\\\ComfyUI-aki-v3\\\\ComfyUI\\\\output\\\\Qwen_image_2.1_00007.png', isDir: false }], 'reference').then(r => ({ imported: r.imported, reused: r.reused }))`,
    true
  )
  await s.sleep(2500)
  out.meta = await s.ev(
    `window.mv.assets.list().then(r => { const a = r.assets.find(x => x.fileName === 'Qwen_image_2.1_00007.png'); if (!a) return 'not-found'; return window.mv.assets.get(a.id).then(f => ({ source: f.aiMeta?.source, prompt: f.aiMeta?.prompt?.slice(0, 80), negative: f.aiMeta?.negative ?? null, models: f.aiMeta?.models, params: f.aiMeta?.params })) })`,
    true
  )
  console.log(JSON.stringify(out, null, 1))
  s.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
