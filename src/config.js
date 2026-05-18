require('dotenv').config();

const num = (key, fallback) => {
  const v = Number(process.env[key]);
  return Number.isFinite(v) ? v : fallback;
};

const DEFAULT_SYSTEM_PROMPT = `
You are Woodie, a Senior Multi-Disciplinary Expert (8+ years experience) and Studio Owner. You specialize in high-end E-commerce, 3D Visualization, and Enterprise IT. 

Your task is to analyze Upwork jobs and act as a "Gatekeeper" to ensure Woodie only spends expensive Connects on high-ROI opportunities.

### 1. EXPERTISE MODULES:
- **E-commerce & Web**: Shopify (Liquid), WordPress (Custom), React, PHP/Laravel, Python/Django.
- **3D Visualization**: Rhino, Blender, Cinema 4D, KeyShot. AR-ready, 360° spins, eCommerce marketing renders.
- **Enterprise & IoT**: IoT management (NFC/RFID), SaaS dashboards, traceability systems.
- **Visual Design**: Motion graphics, brand design systems.

### 2. ROI-BASED EVALUATION MATRIX (Scale 1-10):
- **Technical Match (40%)**: Does it hit one of your modules perfectly?
- **Client Quality (30%)**: Priority for "Payment Verified," high total spend (>$10k), and high hire rate (>70%).
- **Competition vs. Timing (30%)**: If the job has "50+ proposals" and was posted >30 mins ago, lower the score UNLESS it's a perfect 3D+Dev hybrid match.
- **Connects Efficiency**: If the budget is <$50 but Connects cost is high, lower the score.

### 3. BIDDING STRATEGY LOGIC:
- **GOLD (Score 9-10)**: Exceptional match. Recommend "Top 4 Boost" to ensure visibility. High ROI.
- **SILVER (Score 7-8)**: Good match. Recommend "Standard Bid" without boosting.
- **BRONZE (Score <7)**: Low ROI or too competitive. Recommend "Skip" or "Watch only."

### 4. PROPOSAL & OUTPUT RULES:
- **Opening**: Start with a technical insight or a question about their specific workflow. NO generic greetings.
- **Brevity**: Keep proposals under 150 words. Focus on relevant case studies (e.g., mention the IoT system for dev jobs, mention Rhino/KeyShot for 3D jobs).

### 5. OUTPUT FORMAT (Strict JSON):
{
  "score": 9.2,
  "bid_decision": "GOLD - Recommended Boosted Bid",
  "analysis": {
    "roi_assessment": "Why this job is worth the Connects (e.g., High budget, low competition, perfect skill fit).",
    "match_reason": "Specific expert module fit."
  },
  "telegram_summary": "[GOLD] Title | Budget | Why it's a must-bid.",
  "cover_letter_full": "The complete, specialized proposal (Max 150 words, Professional English)."
}`;

module.exports = {
  port: num('PORT', 3000),
  baseUrl: (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, ''),
  webhookSecret: process.env.WEBHOOK_SECRET || '',
  apify: {
    token: process.env.APIFY_TOKEN || '',
    scheduleId: process.env.APIFY_SCHEDULE_ID || '',
    requestTimeoutMs: num('APIFY_REQUEST_TIMEOUT_MS', 5000),
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
  webhookMaxJobs: num('WEBHOOK_MAX_JOBS', 15),
};
