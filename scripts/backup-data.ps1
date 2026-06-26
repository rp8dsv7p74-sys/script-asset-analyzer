param(
  [string]$AppDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$BackupDir = '',
  [string]$DataDir = '',
  [int]$KeepDays = 14
)

$ErrorActionPreference = 'Stop'

if (-not $BackupDir) {
  $BackupDir = Join-Path $AppDir 'backups'
}

if (-not $DataDir) {
  $DataDir = Join-Path $AppDir 'data'
}

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

if (-not (Test-Path -LiteralPath $DataDir)) {
  Write-Host "data directory not found: $DataDir"
  exit 0
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupFile = Join-Path $BackupDir "data-$stamp.zip"

Compress-Archive -Path (Join-Path $DataDir '*') -DestinationPath $backupFile -Force
Write-Host "backup created: $backupFile"

$cutoff = (Get-Date).AddDays(-$KeepDays)
Get-ChildItem -LiteralPath $BackupDir -Filter 'data-*.zip' -File |
  Where-Object { $_.LastWriteTime -lt $cutoff } |
  Remove-Item -Force
