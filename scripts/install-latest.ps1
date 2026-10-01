# install-latest.ps1 — 下载 GitHub 最新版 Media Viewer 并静默安装
# 优先使用本地 release 目录中版本一致的安装包,否则从 GitHub 下载
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$repo = 'dyf1234567/media-viewer'
$root = Split-Path -Parent $PSScriptRoot

try {
  $rel = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest" -Headers @{ 'User-Agent' = 'media-viewer-updater' }
  $tag = $rel.tag_name
} catch {
  Write-Host "获取最新版本失败: $($_.Exception.Message)" -ForegroundColor Yellow
  $tag = $null
}

$setup = $null
# 1) 本地已有对应版本安装包(本地命名带空格,GitHub 资产用连字符)
if ($tag) {
  $ver = $tag.TrimStart('v')
  $local = Get-ChildItem -Path (Join-Path $root 'release') -Filter "*Setup*$ver*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($local) {
    $setup = $local.FullName
    Write-Host "使用本地安装包: $setup"
  }
}
# 2) 从 GitHub 下载
if (-not $setup) {
  if (-not $tag) { Write-Host '无法确定最新版本,安装中止' -ForegroundColor Red; exit 1 }
  $asset = $rel.assets | Where-Object { $_.name -eq "Media-Viewer-Setup-$($tag.TrimStart('v')).exe" } | Select-Object -First 1
  if (-not $asset) { Write-Host '最新版本没有安装包资产' -ForegroundColor Red; exit 1 }
  $tmp = Join-Path $env:TEMP $asset.name
  Write-Host "下载 $tag ($([math]::Round($asset.size / 1MB, 1)) MB) ..."
  $progressPreference = 'silentlyContinue'
  Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $tmp -UseBasicParsing
  $progressPreference = 'Continue'
  $setup = $tmp
  Write-Host "下载完成: $setup"
}

# 静默安装(NSIS /S)
Write-Host '静默安装中...'
$p = Start-Process -FilePath $setup -ArgumentList '/S' -Wait -PassThru
if ($p.ExitCode -ne 0) {
  Write-Host "安装程序退出码 $($p.ExitCode)" -ForegroundColor Red
  exit 1
}

# 查询安装位置并显示版本(注册表 InstallLocation 可能为空,回退默认安装目录)
$inst = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName -like 'Media Viewer*' } | Select-Object -First 1
if ($inst) {
  Write-Host "已安装: $($inst.DisplayName)"
  $loc = $inst.InstallLocation
  if (-not $loc) { $loc = Join-Path $env:LOCALAPPDATA 'Programs\Media Viewer' }
  $exe = Join-Path $loc 'Media Viewer.exe'
  if (Test-Path $exe) {
    Write-Host "启动正式版..."
    Start-Process -FilePath $exe
  } else {
    Write-Host "(未找到 $exe,可从开始菜单启动)"
  }
} else {
  Write-Host '安装完成(未在注册表找到版本信息)'
}
