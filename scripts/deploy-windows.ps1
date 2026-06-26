param(
  [string]$AppDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$Branch = 'main',
  [string]$AppName = 'script-asset-analyzer',
  [switch]$SkipGitPull
)

$ErrorActionPreference = 'Stop'

Set-Location -LiteralPath $AppDir

if (-not (Test-Path -LiteralPath '.env')) {
  throw 'Missing .env. Create it on the server before deploying.'
}

if (-not $SkipGitPull -and (Test-Path -LiteralPath '.git') -and (Get-Command git -ErrorAction SilentlyContinue)) {
  git fetch --all --prune
  git checkout $Branch
  git pull --ff-only origin $Branch
}

& (Join-Path $AppDir 'scripts\backup-data.ps1') -AppDir $AppDir

npm ci
npm test
npm run build

if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
  npm install -g pm2
}

$pm2Exists = $false
try {
  pm2 describe $AppName | Out-Null
  $pm2Exists = $LASTEXITCODE -eq 0
} catch {
  $pm2Exists = $false
}

if ($pm2Exists) {
  pm2 reload ecosystem.config.cjs --only $AppName --update-env
} else {
  pm2 start ecosystem.config.cjs --only $AppName
}

pm2 save
pm2 status $AppName
