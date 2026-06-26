# Windows Server 上线步骤

这份项目已经支持 Windows Server + PM2 部署。服务器上不要提交 `.env`，只在服务器本地保存。

## 1. 服务器准备

推荐安装：

- Node.js 20 LTS 或更新版本
- Git for Windows
- PowerShell 5+，Windows Server 2022 默认已有

阿里云安全组建议先开放：

- `80`：正式 HTTP 入口
- `443`：正式 HTTPS 入口
- `3003`：临时测试入口，确认正式代理后可以关闭
- `3389`：远程桌面，只建议限制为自己的 IP

如果外部无法连接 `3389`、`80` 或 `3003`，先检查阿里云控制台的安全组入方向规则。安全组放行后，再进入服务器执行 Windows 防火墙脚本：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\open-windows-firewall.ps1
```

## 2. 上传项目

推荐目录：

```powershell
C:\apps\script-asset-analyzer
```

可以用 Git 拉取，也可以把本地项目压缩后上传。不要上传：

- `.env`
- `data\`
- `node_modules\`
- `dist\`
- `backups\`
- `logs\`

## 3. 创建服务器 `.env`

在服务器项目目录创建 `.env`：

```ini
QWEN_API_KEY=你的千问密钥
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen-plus
QWEN_MODEL_OPTIONS=qwen-plus,qwen-max,qwen-turbo,qwen-long
ANALYSIS_CHUNK_CHARS=40000
QWEN_TIMEOUT_MS=180000
QWEN_CONCURRENCY=2
PORT=3003
APP_ENV=production
TRUST_PROXY=true
APP_USERNAME=你的登录账号
APP_PASSWORD=至少12位强密码
```

生产环境会拒绝默认账号和默认密码；如果缺少千问密钥，也会拒绝启动。

## 4. 首次部署

在服务器项目目录执行：

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-windows.ps1 -SkipGitPull
powershell -ExecutionPolicy Bypass -File .\scripts\register-pm2-startup-windows.ps1
```

部署完成后访问：

```text
http://服务器公网IP:3003
```

## 5. 后续更新

如果服务器通过 Git 拉取代码：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-windows.ps1
```

如果是手动上传新版代码：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-windows.ps1 -SkipGitPull
```

## 6. 备份数据

手动备份：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\backup-data.ps1
```

历史记录保存在：

```text
data\app-data.json
```

备份文件保存在：

```text
backups\
```

## 7. 常用检查

```powershell
pm2 status
pm2 logs script-asset-analyzer
pm2 restart script-asset-analyzer
```

## 8. 正式域名和 HTTPS

Windows Server 上建议用 IIS 或 Nginx for Windows 反向代理到：

```text
http://127.0.0.1:3003
```

正式使用时建议绑定域名并配置 HTTPS。生产环境下登录 Cookie 会启用安全策略，HTTPS 是推荐配置。
