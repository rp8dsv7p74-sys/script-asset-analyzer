$ErrorActionPreference = "Stop"

$gitCommand = Get-Command git -ErrorAction SilentlyContinue
if ($gitCommand) {
  Write-Host "Git already installed: $($gitCommand.Source)"
  exit 0
}

$tempDir = Join-Path $env:TEMP "script-asset-analyzer-tools"
$installer = Join-Path $tempDir "Git-for-Windows-64-bit.exe"
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

Write-Host "Fetching latest Git for Windows release..."
$release = Invoke-RestMethod -Uri "https://api.github.com/repos/git-for-windows/git/releases/latest" -Headers @{
  "User-Agent" = "script-asset-analyzer-installer"
}

$asset = $release.assets |
  Where-Object { $_.name -match "64-bit\.exe$" -and $_.name -notmatch "PortableGit" } |
  Select-Object -First 1

if (-not $asset) {
  throw "Git for Windows 64-bit installer was not found."
}

Write-Host "Downloading: $($asset.name)"
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $installer -UseBasicParsing

Write-Host "Installing Git for Windows..."
$arguments = "/VERYSILENT /NORESTART /NOCANCEL /SP- /COMPONENTS=`"icons,ext\reg\shellhere,assoc,assoc_sh`""
$process = Start-Process -FilePath $installer -ArgumentList $arguments -Wait -PassThru
if ($process.ExitCode -ne 0) {
  throw "Git installation failed. Exit code: $($process.ExitCode)"
}

$possibleGit = @(
  "$env:ProgramFiles\Git\cmd\git.exe",
  "${env:ProgramFiles(x86)}\Git\cmd\git.exe"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

if (-not $possibleGit) {
  throw "Install completed, but git.exe was not found in common locations. Reopen terminal and try again."
}

Write-Host "Git installed: $possibleGit"
& $possibleGit --version
