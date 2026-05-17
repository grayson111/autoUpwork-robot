# Upwork Robot

Upwork 智能筛选与半自动投递：Apify Webhook → 硬性过滤 → LLM 评估 → Telegram 推送 → Chrome 插件自动填充 Cover Letter。

## 快速开始

```bash
cp .env.example .env
# 编辑 .env 填入 Telegram、OpenAI/Gemini、BASE_URL 等

npm install
npm start
```

Telegram Bot [@MyAutoUpwork_bot](https://t.me/MyAutoUpwork_bot)：先发 `/start` 绑定 Chat ID，再 `/checkin` 上班、`/checkout` 下班、`/status` 查看状态。

配置 `APIFY_TOKEN` 与 `APIFY_SCHEDULE_ID` 后，`/checkin` 会启用 Apify 定时任务，`/checkout` 会暂停（`PUT /v2/schedules/:id`，`isEnabled`）。

默认 LLM 为 **DeepSeek**（`LLM_PROVIDER=deepseek`），兼容 OpenAI SDK。

## Apify Webhook

在 Apify Actor `neatrat/upwork-job-scraper` 运行完成后，将 Webhook 指向：

```
POST https://你的域名/api/webhook/upwork-jobs
Header: x-webhook-secret: <WEBHOOK_SECRET>   # 若已配置
```

Body 支持：任务数组、`{ items: [...] }` 或单条任务对象。

## Chrome 插件

1. 打开 `chrome://extensions`，开启开发者模式
2. 加载已解压的扩展程序 → 选择 `extension/` 目录
3. 在 Upwork 投递页控制台执行一次（将 API 改为你的 Hostinger 地址）：

```js
localStorage.setItem('upwork_copilot_api', 'https://你的域名');
```

4. 从 Telegram 按钮打开带 `?ref=mybot&job_id=xxx` 的链接即可自动填充

## 环境变量

见 `.env.example`。

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查与打卡状态 |
| POST | `/api/webhook/upwork-jobs` | Apify 任务入库与推送 |
| GET | `/api/proposal?job_id=` | 插件获取 Cover Letter（CORS 已放行 upwork.com） |

## Hostinger 部署

上传项目后执行 `npm install --production`，用 Node.js 应用或 PM2 启动 `npm start`，将 `BASE_URL` 设为公网 HTTPS 地址。
"# autoUpwork-robot" 
