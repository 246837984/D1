# Publish dsh-flash-notify to GitHub and regenerate the plugin market index.
#
# Usage:
#   pwsh -File scripts/publish.ps1                       # pushes to origin, then refreshes market/index.json
#   pwsh -File scripts/publish.ps1 -Owner someone -Repo xyz
#   pwsh -File scripts/publish.ps1 -SkipPush             # commit + build index only
#   pwsh -File scripts/publish.ps1 -Name "YG" -Email "yg@example.com"
#
# The first push asks GitHub for credentials through Git Credential Manager;
# complete the browser sign-in once and later pushes are silent.

param(
    [string]$Owner = 'HunYiSage',
    [string]$Repo = 'dsh-flash-notify',
    [string]$Branch = 'main',
    [string]$Name = '',
    [string]$Email = '',
    [switch]$SkipPush,
    [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

function Step($message) { Write-Host "`n== $message" -ForegroundColor Cyan }

Step 'git identity'
$currentName = git config --local user.name 2>$null
if (-not $currentName) {
    $fallbackName = if ($Name) { $Name } else { $Owner }
    $fallbackEmail = if ($Email) { $Email } else { "$Owner@users.noreply.github.com" }
    git config --local user.name $fallbackName
    git config --local user.email $fallbackEmail
    Write-Host "set local identity: $fallbackName <$fallbackEmail>"
} else {
    Write-Host "identity: $currentName"
}

if (-not $SkipTests) {
    Step 'tests'
    node --test "test/**/*.test.mjs"
    if ($LASTEXITCODE -ne 0) { throw 'tests failed' }
}

Step 'repository'
if (-not (Test-Path (Join-Path $root '.git'))) {
    git init | Out-Null
    git symbolic-ref HEAD "refs/heads/$Branch"
    Write-Host "initialized repository on $Branch"
}
git add -A
git commit -m "chore: publish dsh-flash-notify" 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host 'nothing to commit' }

$remote = git remote get-url origin 2>$null
if (-not $remote) {
    $url = "https://github.com/$Owner/$Repo.git"
    git remote add origin $url
    Write-Host "remote origin -> $url"
} else {
    Write-Host "remote origin -> $remote"
}

if (-not $SkipPush) {
    Step 'push source'
    git push -u origin "HEAD:$Branch"
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "push failed. If the repository does not exist yet, create it first:"
        Write-Host "  https://github.com/new?name=$Repo   (no README, no .gitignore, no license)"
        Write-Host 'Then rerun this script. The first push opens a GitHub sign-in through Git Credential Manager.'
        throw 'push failed (credentials or missing repository)'
    }
}

Step 'market index'
node scripts/build-market-index.mjs --owner $Owner --repo $Repo --branch $Branch
if ($LASTEXITCODE -ne 0) { throw 'market index build failed' }
node scripts/verify-market-index.mjs
if ($LASTEXITCODE -ne 0) { throw 'market index verification failed' }

git add market/index.json
git commit -m "chore(market): refresh index" 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
    if (-not $SkipPush) {
        git push origin "HEAD:$Branch"
        if ($LASTEXITCODE -ne 0) { throw 'push of market index failed' }
    }
} else {
    Write-Host 'market index unchanged'
}

$indexUrl = "https://raw.githubusercontent.com/$Owner/$Repo/$Branch/market/index.json"
Step 'done'
Write-Host "market index: $indexUrl"
Write-Host 'Add it in DeepSeek Harness: Plugins -> Discover -> Add index source (needs the optional "plugin market" bundle enabled).'
Write-Host "Or run: pwsh -File scripts/install-market.ps1 -IndexUrl `"$indexUrl`""
