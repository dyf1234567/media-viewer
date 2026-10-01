// commit-via-api.cjs — 通过 GitHub Git Data API 提交(本机 git 不可用时的兜底)
const { execSync } = require('child_process')
const fs = require('fs')

const EP = 'repos/dyf1234567/media-viewer'
const api = (endpoint, inputFile, method = 'GET') =>
  execSync(
    `gh api ${method ? '-X ' + method + ' ' : ''}${endpoint}${inputFile ? ' --input ' + inputFile : ''}`,
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  )

const files = [
  'src/renderer/src/components/Previewer.vue',
  'scripts/cdp.cjs',
  'scripts/update.ps1',
  'scripts/install-latest.ps1',
  'scripts/ensure-bom.cjs',
  'scripts/find-git.cjs',
  'scripts/scan-git.cjs',
  'scripts/check-css.cjs',
  'scripts/check-urls.cjs',
  'scripts/list-targets.cjs',
  'scripts/probe-state.cjs',
  'scripts/probe-resp.cjs',
  'scripts/perf-preview.cjs',
  'scripts/perf-size.cjs',
  'scripts/perf-idle.cjs',
  'scripts/profiler-drag.cjs',
  'scripts/qa-preview2.cjs',
  'scripts/commit-via-api.cjs',
  'package.json',
  '测试与更新.bat'
]

function run() {
  const head = JSON.parse(api(`${EP}/branches/master`))
  const headSha = head.commit.sha
  const baseTree = head.commit.commit.tree.sha
  console.log('HEAD:', headSha.slice(0, 10))

  const tree = []
  for (const rel of files) {
    const buf = fs.readFileSync(rel)
    fs.writeFileSync('scripts/tmp-req.json', JSON.stringify({ content: buf.toString('base64'), encoding: 'base64' }))
    const blob = JSON.parse(api(`${EP}/git/blobs`, 'scripts/tmp-req.json', 'POST'))
    tree.push({ path: rel.replace(/\\/g, '/'), mode: '100644', type: 'blob', sha: blob.sha })
    console.log('blob:', rel, blob.sha.slice(0, 8))
  }

  fs.writeFileSync('scripts/tmp-req.json', JSON.stringify({ base_tree: baseTree, tree }))
  const newTree = JSON.parse(api(`${EP}/git/trees`, 'scripts/tmp-req.json', 'POST'))
  console.log('tree:', newTree.sha.slice(0, 10))

  const msg = [
    'feat: 测试与更新流程(bat) + 预览器流畅度与侧栏联动',
    '',
    '- 新增 测试与更新.bat + scripts/update.ps1 + install-latest.ps1:构建→启动测试实例(与正式版同库)→确认→静默安装最新版;bat 为纯 ASCII,中文逻辑在带 BOM 的 ps1 中,规避 cmd 多字节解析错位',
    '- 预览器:合成层按适配显示尺寸栅格化,大图拖动不再触发数百毫秒整层重栅格',
    '- 预览渐进加载:缩略图秒开,原图解码后无缝替换;适配尺寸用库内宽高,不等解码',
    '- 预览区左侧避让侧栏宽度,预览打开时侧栏收起/展开按钮真实生效',
    '- cdp.cjs 命令 30s 超时保护;新增帧率/CPU 采样与预览验收脚本'
  ].join('\n')
  fs.writeFileSync('scripts/tmp-req.json', JSON.stringify({ message: msg, tree: newTree.sha, parents: [headSha] }))
  const commit = JSON.parse(api(`${EP}/git/commits`, 'scripts/tmp-req.json', 'POST'))
  console.log('commit:', commit.sha.slice(0, 10))

  fs.writeFileSync('scripts/tmp-req.json', JSON.stringify({ sha: commit.sha, force: false }))
  api(`${EP}/git/refs/heads/master`, 'scripts/tmp-req.json', 'PATCH')
  console.log('已推送到 master ✓')

  fs.rmSync('scripts/tmp-req.json', { force: true })
}

run()
