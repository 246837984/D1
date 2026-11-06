# 卸载 DshFlash 插件：撤销 profile patch 注册、删除插件与工具、清理遗留
param(
    [switch]$KeepLog
)

$ErrorActionPreference = 'Continue'
$profileDir = Join-Path $env:USERPROFILE '.dsh\profiles\desktop'
$patch = Join-Path $profileDir 'cordis.patch.yml'
$pluginDir = Join-Path $profileDir 'plugins\dsh-flash-notify'
$bin = Join-Path $env:USERPROFILE '.dsh\bin'
$exe = Join-Path $bin 'DshFlash.exe'
$lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'dsh-flash-notify.lnk'
$log = Join-Path $env:USERPROFILE '.dsh\DshFlash.log'

# 1) 结束任何残留进程
if (Test-Path $exe) { & $exe stop | Out-Null }
Get-CimInstance Win32_Process -Filter "Name='DshFlash.exe'" |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host "已结束残留进程: $($_.ProcessId)" }

# 2) 从 cordis.patch.yml 移除注册条目
if (Test-Path $patch) {
    $text = [System.IO.File]::ReadAllText($patch)
    if ($text -match 'dsh-flash-notify') {
        $backup = "$patch.bak-flash-rm-$([DateTimeOffset]::Now.ToUnixTimeMilliseconds())"
        Copy-Item $patch $backup -Force
        Write-Host "已备份: $backup"

        $lines = $text -split "`r?`n"
        $kept = New-Object System.Collections.Generic.List[string]
        for ($i = 0; $i -lt $lines.Length; $i++) {
            $line = $lines[$i]
            if ($line -match '^\s*- id:\s*dsh-flash-notify\s*$') { continue }
            if ($line -match '^\s*name:\s*\./plugins/dsh-flash-notify/') { continue }
            $kept.Add($line)
        }
        $result = ($kept -join "`n").TrimEnd("`r", "`n") + "`n"
        [System.IO.File]::WriteAllText($patch, $result, (New-Object System.Text.UTF8Encoding($false)))
        Write-Host '已从 cordis.patch.yml 移除插件条目'
    } else {
        Write-Host 'cordis.patch.yml 中没有该条目'
    }
}

# 3) 删除插件目录与工具
if (Test-Path $pluginDir) { Remove-Item $pluginDir -Recurse -Force; Write-Host "已删除: $pluginDir" }
foreach ($f in @('DshFlash.exe', 'DshFlash.cs')) {
    $p = Join-Path $bin $f
    if (Test-Path $p) { Remove-Item $p -Force; Write-Host "已删除: $p" }
}

# 4) 清理可能存在的开机自启项
if (Test-Path $lnk) { Remove-Item $lnk -Force; Write-Host "已删除开机自启: $lnk" }

# 5) 日志
if (-not $KeepLog -and (Test-Path $log)) { Remove-Item $log -Force; Write-Host "已删除日志: $log" }

Write-Host ''
Write-Host '卸载完成。重启 DeepSeek Harness 后插件即不再加载。'
