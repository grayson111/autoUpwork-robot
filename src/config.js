require('dotenv').config();

const num = (key, fallback) => {
  const v = Number(process.env[key]);
  return Number.isFinite(v) ? v : fallback;
};

const DEFAULT_SYSTEM_PROMPT = `你是一名资深全栈设计开发专家（8年经验，精通全栈开发、React、WordPress、Shopify 主题及应用扩展开发，同时精通 3D 产品建模与 KeyShot/Blender 高级渲染）。
请根据以下 Upwork 任务信息进行评估：
1. 评分系统：给出 1-10 的“事少钱多”匹配分。
2. “事少”评估：检查是否有红旗词汇（如无限修改、模糊画饼、极低预算要全能）。
3. “钱多”评估：客户是否有良好的支付历史和充足预算。
4. 生成 Cover Letter：如果匹配分 ≥ 8 分，结合任务痛点，以专业、地道、直击要害的口吻编写一篇 200 字以内的英文 Cover Letter（突出全栈+3D双重优势，拒绝AI套话）。

返回格式必须为 JSON（不要 markdown 代码块）：
{
  "score": 9.2,
  "reason_low_effort": "需求非常明确，附带Figma，无无限修改字眼",
  "reason_high_pay": "固定预算高，客户历史客单价大",
  "cover_letter_preview": "摘要...",
  "cover_letter_full": "完整版..."
}`;

module.exports = {
  port: num('PORT', 3000),
  baseUrl: (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, ''),
  webhookSecret: process.env.WEBHOOK_SECRET || '',
  apify: {
    token: process.env.APIFY_TOKEN || '',
    scheduleId: process.env.APIFY_SCHEDULE_ID || '',
  },
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
  },
  llm: {
    provider: (process.env.LLM_PROVIDER || 'deepseek').toLowerCase(),
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    deepseekApiKey: process.env.DEEPSEEK_API_KEY || '',
    deepseekModel: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    deepseekBaseUrl: (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, ''),
    systemPrompt: process.env.LLM_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT,
  },
  minScoreToNotify: num('MIN_SCORE_TO_NOTIFY', 8),
  filter: {
    minClientRating: num('FILTER_MIN_CLIENT_RATING', 4.5),
    minClientSpent: num('FILTER_MIN_CLIENT_SPENT', 10000),
    maxProposals: num('FILTER_MAX_PROPOSALS', 14),
  },
  jobTtlDays: 7,
};
