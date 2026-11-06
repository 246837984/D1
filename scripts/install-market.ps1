# Point DeepSeek Harness at this repository's plugin market index.
#
# Usage:
#   pwsh -File scripts/install-market.ps1
#   pwsh -File scripts/install-market.ps1 -IndexUrl https://example.com/index.json
#
# This writes the `plugin-market` entry into the desktop profile patch. The
# optional "plugin market" bundle must be enabled for the Discover tab and the
# `plugin-market` service to exist; this script checks and tells you what is
# missing instead of editing package dependencies behind your back.

param(
    [string]$IndexUrl = '',
    [string]$Owner = 'HunYiSage',
    [string]$Repo = 'dsh-flash-notify',
    [string]$Branch = 'main',
    [string]$Profile = 'desktop'
)

$ErrorActionPreference = 'Stop'

if (-not $IndexUrl) {
    $IndexUrl = "https://raw.githubusercontent.com/$Owner/$Repo/$Branch/market/index.json"
}
if ($IndexUrl -notmatch '^https?://') { throw "index URL must be http(s): $IndexUrl" }

$profileDir = Join-Path $env:USERPROFILE ".dsh\profiles\$Profile"
$patch = Join-Path $profileDir 'cordis.patch.yml'
$manifest = Join-Path $profileDir 'package.json'
if (-not (Test-Path $patch)) { throw "profile not found: $patch" }

Write-Host "index: $IndexUrl"

# 1) Is the optional market bundle enabled?
$bundles = @()
if (Test-Path $manifest) {
    $json = Get-Content $manifest -Raw | ConvertFrom-Json
    $bundles = @($json.dsh.profile.bundles)
}
$hasMarket = $bundles -contains '@deepseek-ai/dsh-experimental-plugin-market-bundle'
$hasPackages = Test-Path (Join-Path $profileDir 'node_modules\@deepseek-ai\dsh-plugin-market')

if (-not $hasMarket -or -not $hasPackages) {
    Write-Host ''
    Write-Warning 'The optional plugin-market bundle is not enabled in this profile.'
    Write-Host 'Enable it first (one of):'
    Write-Host '  a) DeepSeek Harness -> Plugins page -> enable the "plugin market" bundle'
    Write-Host '  b) pnpm add @deepseek-ai/dsh-experimental-plugin-market-bundle@0.2.1-rc.2  (in the profile directory)'
    Write-Host '     then add "@deepseek-ai/dsh-experimental-plugin-market-bundle" to dsh.profile.bundles in package.json'
    Write-Host '  c) let the plugin manager install it, then restart the app'
    Write-Host ''
    Write-Host 'The index URL will still be written to the patch so it applies on the next restart.'
}

# 2) Write the plugin-market config (idempotent)
$text = [System.IO.File]::ReadAllText($patch)
if ($text -match [regex]::Escape($IndexUrl)) {
    Write-Host 'patch already lists this index URL'
} elseif ($text -match '(?m)^\s*- id:\s*plugin-market\s*$') {
    Write-Warning 'cordis.patch.yml already has a plugin-market entry; merge this into its config.indexes list:'
    Write-Host "    - $IndexUrl"
} else {
    $backup = "$patch.bak-market-$([DateTimeOffset]::Now.ToUnixTimeMilliseconds())"
    Copy-Item $patch $backup -Force
    Write-Host "backup: $backup"

    $block = @(
        ''
        '- id: plugin-market'
        "  name: '@deepseek-ai/dsh-plugin-market'"
        '  config:'
        '    indexes:'
        "      - $IndexUrl"
    ) -join "`n"

    $new = $text.TrimEnd("`r", "`n") + $block + "`n"
    [System.IO.File]::WriteAllText($patch, $new, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host 'patched cordis.patch.yml'
}

Write-Host ''
Write-Host 'Restart DeepSeek Harness, then open Plugins -> Discover and install dsh-flash-notify.'
