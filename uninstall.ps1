# 卸载 dsh-flash-notify（bundle 形态）。
#
# 用法: pwsh -File uninstall.ps1 [-Profile desktop] [-KeepLog]
param(
    [string]$Profile = 'desktop',
    [switch]$KeepLog
)

$ErrorActionPreference = 'Continue'
$profileDir = Join-Path $env:USERPROFILE ".dsh\profiles\$Profile"
$manifest = Join-Path $profileDir 'package.json'
$patch = Join-Path $profileDir 'cordis.patch.yml'
$log = Join-Path $env:USERPROFILE '.dsh\dsh-flash-notify.log'

# 1) 结束可能残留的闪烁器进程
Get-CimInstance Win32_Process -Filter "Name='DshFlash.exe'" |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host "已结束进程: $($_.ProcessId)" }

# 2) 从 profile 的 bundle 列表移除
if (Test-Path $manifest) {
    $json = Get-Content $manifest -Raw | ConvertFrom-Json
    $bundles = @($json.dsh.profile.bundles)
    if ($bundles -contains 'dsh-flash-notify') {
        $backup = "$manifest.bak-flash-rm-$([DateTimeOffset]::Now.ToUnixTimeMilliseconds())"
        Copy-Item $manifest $backup -Force
        $json.dsh.profile.bundles = @($bundles | Where-Object { $_ -ne 'dsh-flash-notify' })
        ($json | ConvertTo-Json -Depth 20) | Set-Content $manifest -Encoding UTF8
        Write-Host "已从 dsh.profile.bundles 移除（备份: $backup）"
        Write-Host '如需清理依赖: pnpm remove dsh-flash-notify（在该 profile 目录执行）'
    } else {
        Write-Host 'dsh.profile.bundles 中没有 dsh-flash-notify'
    }
}

# 3) 清掉 patch 里的相关行（只挂插件方式安装时才会存在）
if (Test-Path $patch) {
    $text = [System.IO.File]::ReadAllText($patch)
    if ($text -match 'dsh-flash-notify') {
        $backup = "$patch.bak-flash-rm-$([DateTimeOffset]::Now.ToUnixTimeMilliseconds())"
        Copy-Item $patch $backup -Force
        $lines = $text -split "`r?`n"
        $kept = New-Object System.Collections.Generic.List[string]
        for ($i = 0; $i -lt $lines.Length; $i++) {
            $line = $lines[$i]
            if ($line -match '^\s*- id:\s*dsh-flash-notify\s*$') { continue }
            if ($line -match '^\s*name:\s*(dsh-flash-notify|file:///.*dsh-flash-notify)') { continue }
            if ($line -match '^\s*name:\s*\./plugins/dsh-flash-notify/') { continue }
            $kept.Add($line)
        }
        $result = ($kept -join "`n").TrimEnd("`r", "`n") + "`n"
        [System.IO.File]::WriteAllText($patch, $result, (New-Object System.Text.UTF8Encoding($false)))
        Write-Host "已清理 cordis.patch.yml 中的条目（备份: $backup）"
    }
}

# 4) 只挂插件方式留下的目录
$pluginDir = Join-Path $profileDir 'plugins\dsh-flash-notify'
if (Test-Path $pluginDir) { Remove-Item $pluginDir -Recurse -Force; Write-Host "已删除: $pluginDir" }

# 5) 日志
if (-not $KeepLog -and (Test-Path $log)) { Remove-Item $log -Force; Write-Host "已删除日志: $log" }

Write-Host ''
Write-Host '完成。重启 DeepSeek Harness 后插件即不再加载。'
