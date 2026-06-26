param(
  [int[]]$Ports = @(80, 443, 3003),
  [string]$RulePrefix = 'Script Asset Analyzer'
)

$ErrorActionPreference = 'Stop'

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Please run this script in PowerShell as Administrator.'
}

foreach ($port in $Ports) {
  $ruleName = "$RulePrefix TCP $port"
  $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
  if ($existing) {
    Set-NetFirewallRule -DisplayName $ruleName -Enabled True -Action Allow
  } else {
    New-NetFirewallRule `
      -DisplayName $ruleName `
      -Direction Inbound `
      -Protocol TCP `
      -LocalPort $port `
      -Action Allow | Out-Null
  }
  Write-Host "firewall opened: TCP $port"
}
