# 任务栏闪烁提示（dsh-flash-notify）— 一句话安装
#
#   irm https://github.com/246837984/D1/raw/main/install.ps1 | iex
#
# 它做三件事：下载最新代码 → 放到 profile 的插件目录 → 让 Harness 加载它。
# 幂等：重复运行只更新文件，不会写出重复的配置条目。

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$repo = '246837984/D1'
$branch = 'main'
$zipUrl = "https://codeload.github.com/$repo/zip/refs/heads/$branch"
$profileDir = Join-Path $env:USERPROFILE '.dsh\profiles\desktop'
$target = Join-Path $profileDir 'plugins\dsh-flash-notify'
$manifest = Join-Path $profileDir 'package.json'
$patch = Join-Path $profileDir 'cordis.patch.yml'

Write-Host ''
Write-Host '任务栏闪烁提示 — 安装中' -ForegroundColor Cyan

if (-not (Test-Path $profileDir)) {
  throw "找不到 profile 目录：$profileDir。请先启动一次 DeepSeek Harness。"
}

# ---------- 1. 下载 ----------
$tmp = Join-Path $env:TEMP ('dsh-flash-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$zip = Join-Path $tmp 'plugin.zip'
Write-Host "  下载代码 …"
Invoke-WebRequest $zipUrl -OutFile $zip
Expand-Archive $zip -DestinationPath $tmp -Force
$src = Get-ChildItem $tmp -Directory | Where-Object { $_.Name -like 'D1-*' } | Select-Object -First 1
if (-not $src) { throw '解压后找不到源码目录' }

# ---------- 2. 复制 ----------
New-Item -ItemType Directory -Force -Path $target | Out-Null
Copy-Item (Join-Path $src.FullName '*') $target -Recurse -Force
if (-not (Test-Path (Join-Path $target 'src\index.js'))) { throw '复制失败：缺少 src\index.js' }
Write-Host "  代码已放到 $target" -ForegroundColor DarkGray

# ---------- 3. 让 Harness 加载它 ----------
$bundled = $false
if (Test-Path $manifest) {
  try {
    $j = Get-Content $manifest -Raw | ConvertFrom-Json
    $bundled = @($j.dsh.profile.bundles) -contains 'dsh-flash-notify'
  } catch { }
}

if ($bundled) {
  $moduleDir = Join-Path $profileDir 'node_modules\dsh-flash-notify'
  if (Test-Path $moduleDir) {
    Copy-Item (Join-Path $target '*') $moduleDir -Recurse -Force
    Write-Host '  已更新 bundle 安装的那份副本' -ForegroundColor DarkGray
  }
} elseif (Test-Path $patch) {
  Copy-Item $patch "$patch.bak-flash" -Force
  $text = [System.IO.File]::ReadAllText($patch)
  if ($text -notmatch 'dsh-flash-notify') {
    $block = "- insert:`n    - id: dsh-flash-notify`n      name: ./plugins/dsh-flash-notify/src/index.js`n      config:`n        enabled: true`n        debounceMs: 1200`n"
    [System.IO.File]::AppendAllText($patch, "`n" + $block, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host '  已写入 cordis.patch.yml（原文件备份为 .bak-flash）' -ForegroundColor DarkGray
  } else {
    Write-Host '  cordis.patch.yml 已有条目，跳过' -ForegroundColor DarkGray
  }
} else {
  $block = "- insert:`n    - id: dsh-flash-notify`n      name: ./plugins/dsh-flash-notify/src/index.js`n      config:`n        enabled: true`n        debounceMs: 1200`n"
  [System.IO.File]::WriteAllText($patch, $block, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host '  已创建 cordis.patch.yml' -ForegroundColor DarkGray
}

# ---------- 4. 自检 ----------
$exe = Join-Path $target 'assets\win32\DshFlash.exe'
if (Test-Path $exe) {
  try { & $exe flash --no-follow | Out-Null } catch { }
  Write-Host '  闪烁器已自检（窗口在前台时不会闪）' -ForegroundColor DarkGray
}

Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ''
Write-Host '装好了。现在完全退出 DeepSeek Harness，再打开就生效。' -ForegroundColor Green
Write-Host "日志：$env:USERPROFILE\.dsh\dsh-flash-notify.log"
Write-Host ''