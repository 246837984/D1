# Build assets/win32/DshFlash.exe from the single-file C# source.
#
# The prebuilt helper is optional: without it the plugin falls back to
# src/win32-flash.ps1, which flashes the same taskbar button but pays the
# PowerShell start-up cost (~0.5 s) per notification.
#
# Requires the .NET Framework compiler that ships with Windows; no SDK needed.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$source = Join-Path $root 'assets\win32\DshFlash.cs'
$output = Join-Path $root 'assets\win32\DshFlash.exe'

$csc = @(
    'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe',
    'C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe'
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $csc) {
    throw 'csc.exe not found; install the .NET Framework or keep the PowerShell fallback.'
}

& $csc /nologo /target:winexe /optimize+ /platform:anycpu /out:$output $source
if ($LASTEXITCODE -ne 0) { throw "compilation failed with exit code $LASTEXITCODE" }

$file = Get-Item $output
Write-Host "built $($file.FullName) ($($file.Length) bytes)"
