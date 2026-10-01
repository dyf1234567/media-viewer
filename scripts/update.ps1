# update.ps1 — Media Viewer 测试与更新主流程(bat 仅是 ASCII 入口,所有逻辑在此)
# 必须带 UTF-8 BOM 保存,否则 PowerShell 5.1 会把中文解析成乱码
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host '==============================================' -ForegroundColor Cyan
Write-Host '  Media Viewer 测试与更新' -ForegroundColor Cyan
Write-Host '  流程: 构建 -> 启动测试实例 -> 确认 -> 重装' -ForegroundColor Cyan
Write-Host '==============================================' -ForegroundColor Cyan
Write-Host ''

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Host '[错误] 未找到 Node.js/npm, 请先安装 Node.js' -ForegroundColor Red
  exit 1
}

Write-Host '[1/3] 构建最新代码...'
& npm run build
if ($LASTEXITCODE -ne 0) {
  Write-Host ''
  Write-Host '[错误] 构建失败, 代码可能有问题, 已中止' -ForegroundColor Red
  exit 1
}
Write-Host ''

# 若正式版正在运行,提示先关闭(两个实例同时开一个库容易混乱)
$running = Get-Process 'Media Viewer' -ErrorAction SilentlyContinue
if ($running) {
  Write-Host '提示: 正式版 Media Viewer 正在运行, 建议先关闭它再测试' -ForegroundColor Yellow
}

Write-Host '[2/3] 启动测试实例(与正式版共用同一个图库)'
Write-Host '  测试完成后直接关闭测试实例窗口, 流程会自动继续'
Write-Host ''
& npx electron.cmd 'out\main\index.js'
Write-Host ''
Write-Host '测试实例已关闭'
Write-Host ''

$ans = Read-Host '测试通过, 现在安装或更新正式版? (Y=安装 N=跳过)'
if ($ans -notmatch '^[Yy]') {
  Write-Host '已取消安装'
  exit 0
}

Write-Host ''
Write-Host '[3/3] 关闭正式版并安装最新版...'
Get-Process 'Media Viewer' -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 800
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'install-latest.ps1')
if ($LASTEXITCODE -ne 0) {
  Write-Host ''
  Write-Host '[错误] 安装失败, 可到 github.com/dyf1234567/media-viewer/releases 手动下载' -ForegroundColor Red
  exit 1
}
Write-Host ''
Write-Host '完成!' -ForegroundColor Green
