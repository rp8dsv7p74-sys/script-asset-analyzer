param(
  [string]$AppDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$TaskName = 'ScriptAssetAnalyzerPM2'
)

$ErrorActionPreference = 'Stop'

$pm2Command = (Get-Command pm2 -ErrorAction SilentlyContinue)
if (-not $pm2Command) {
  throw 'pm2 is not installed. Run scripts\deploy-windows.ps1 first.'
}

$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction `
  -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -Command `"Set-Location -LiteralPath '$AppDir'; pm2 resurrect`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Highest

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Description 'Restore script asset analyzer PM2 process after Windows login.' `
  -Force | Out-Null

Write-Host "startup task registered: $TaskName"
