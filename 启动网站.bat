@echo off
chcp 65001 >nul
setlocal

set "APP_DIR=%~dp0"
cd /d "%APP_DIR%"

if not exist "node_modules" (
  echo 正在安装网站依赖，请稍等...
  call npm.cmd install
  if errorlevel 1 (
    echo.
    echo 依赖安装失败，请检查网络后重试。
    pause
    exit /b 1
  )
)

powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 3003 -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" >nul 2>nul
if errorlevel 1 (
  start "剧本资产分析-后端" cmd /k "cd /d "%APP_DIR%" && set NODE_ENV=development&& npm.cmd run server"
)

powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" >nul 2>nul
if errorlevel 1 (
  start "剧本资产分析-前端" cmd /k "cd /d "%APP_DIR%" && npm.cmd run client"
)

echo 正在打开剧本资产分析网站...
timeout /t 4 /nobreak >nul
start "" "http://127.0.0.1:5173/"

endlocal
