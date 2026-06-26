# 剧本角色资产分析网站

本地运行的网站，用于上传 `.docx` 或 `.pdf` 剧本，调用千问 API 自动整理角色资产表，并导出 Excel。

## 使用步骤

1. 复制 `.env.example` 为 `.env`。
2. 在 `.env` 中填写你的千问密钥：

```ini
QWEN_API_KEY=你的千问API密钥
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen-plus
PORT=3003
APP_USERNAME=admin
APP_PASSWORD=123456
```

3. 安装依赖：

```bash
npm install
```

4. 启动网站：

```bash
npm run dev
```

5. 打开终端显示的本地地址，上传剧本并分析。

## 功能

- 支持上传或拖入 `.docx` 和 `.pdf` 剧本。
- 支持本地账号登录，默认账号 `admin`，默认密码 `123456`。
- 支持单个整部剧本文档，也支持一次选择多个单集文件。
- 会优先从正文中的 `第03集`、`EP02` 等标题识别每条记录的出现集数。
- 如果只上传单集文件，也会从文件名或文档标题补充集数。
- 表格固定四列：`人物角色`、`服装`、`出现集数`、`详细描述`。
- 支持编辑单元格、新增行、删除行、重新分析。
- 导出 `.xlsx` 文件。

## 注意

- 不支持老式 `.doc` 文件，请先转为 `.docx`。
- API 密钥只放在本地 `.env` 文件中，不要提交或分享。
- 如果 PowerShell 阻止 `npm` 命令，可以使用 `npm.cmd run dev`。
