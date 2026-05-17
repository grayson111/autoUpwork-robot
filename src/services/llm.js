const OpenAI = require('openai');
const config = require('../config');

function buildUserPrompt(job) {
  return `任务标题: ${job.title}
预算: ${job.budget}
技能标签: ${job.skills.join(', ') || 'N/A'}
竞争度 (提案数): ${job.proposals_count}
客户评分: ${job.client.rating || 'N/A'}
客户历史消费: $${job.client.totalSpent}
支付验证: ${job.client.isPaymentVerified ? '是' : '否'}

任务描述:
${job.description.slice(0, 6000)}`;
}

function parseLlmJson(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonStr = fenced ? fenced[1].trim() : trimmed;
  const start = jsonStr.indexOf('{');
  const end = jsonStr.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('LLM response is not JSON');
  return JSON.parse(jsonStr.slice(start, end + 1));
}

async function evaluateWithOpenAICompatible(job, { apiKey, baseURL, model }) {
  const client = new OpenAI({ apiKey, baseURL });
  const response = await client.chat.completions.create({
    model,
    temperature: 0.4,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: config.llm.systemPrompt },
      { role: 'user', content: buildUserPrompt(job) },
    ],
  });
  const content = response.choices[0]?.message?.content || '';
  return parseLlmJson(content);
}

async function evaluateWithOpenAI(job) {
  return evaluateWithOpenAICompatible(job, {
    apiKey: config.llm.openaiApiKey,
    model: config.llm.openaiModel,
  });
}

async function evaluateWithDeepseek(job) {
  return evaluateWithOpenAICompatible(job, {
    apiKey: config.llm.deepseekApiKey,
    baseURL: `${config.llm.deepseekBaseUrl}/v1`,
    model: config.llm.deepseekModel,
  });
}

async function evaluateWithGemini(job) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.llm.geminiModel}:generateContent?key=${config.llm.geminiApiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: `${config.llm.systemPrompt}\n\n${buildUserPrompt(job)}` },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.4,
        responseMimeType: 'application/json',
      },
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error: ${res.status} ${errText}`);
  }
  const data = await res.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return parseLlmJson(content);
}

async function evaluateJob(job) {
  const provider = config.llm.provider;
  if (provider === 'gemini') {
    if (!config.llm.geminiApiKey) throw new Error('GEMINI_API_KEY is not set');
    return evaluateWithGemini(job);
  }
  if (provider === 'deepseek') {
    if (!config.llm.deepseekApiKey) throw new Error('DEEPSEEK_API_KEY is not set');
    return evaluateWithDeepseek(job);
  }
  if (provider === 'openai') {
    if (!config.llm.openaiApiKey) throw new Error('OPENAI_API_KEY is not set');
    return evaluateWithOpenAI(job);
  }
  throw new Error(`Unknown LLM_PROVIDER: ${provider}`);
}

module.exports = { evaluateJob, buildUserPrompt };
