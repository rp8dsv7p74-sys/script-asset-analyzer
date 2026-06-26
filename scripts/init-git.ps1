$ErrorActionPreference = "Stop"

$appDir = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $appDir

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host "未检测到 Git。请先安装 Git for Windows：https://git-scm.com/download/win"
  exit 1
}

if (-not (Test-Path ".git") -or -not (Test-Path ".git\HEAD")) {
  git init
}

git add .
git commit -m "Initial deployable version"

Write-Host "Git 仓库已初始化并完成首次提交。"
