const TelegramBot = require('node-telegram-bot-api');
const config = require('../config');
const {
  getDutyStatus,
  setDutyStatus,
  getJob,
  getSetting,
  setSetting,
  getWebhookStats,
  getJobsOverview,
} = require('../db/sqlite');
const {
  formatTime,
  buildWebhookStatsSection,
  buildJobsOverviewSection,
} = require('../utils/statusReport');
const { buildJobMessage, buildApplyUrl } = require('../utils/telegramFormat');
const apify = require('./apify');

const startedAt = Date.now();
let bot = null;
let commandsRegistered = false;

function useWebhookMode() {
  if (process.env.TELEGRAM_USE_POLLING === 'true') return false;
  if (process.env.TELEGRAM_USE_WEBHOOK === 'false') return false;
  return config.baseUrl.startsWith('https://');
}

function getWebhookUrl() {
  return `${config.baseUrl}/api/telegram/webhook`;
}

function touchBotAlive() {
  setSetting('bot_last_alive', new Date().toISOString());
}

function apifyLine(result, enabledVerb, disabledVerb) {
  if (result.skipped) {
    return '\n⚠️ Apify：未配置 APIFY_TOKEN，仅更新本地打卡状态。';
  }
  if (result.isEnabled) {
    return `\n✅ Apify 定时任务已${enabledVerb}（Schedule: ${result.scheduleId}）`;
  }
  return `\n⏸ Apify 定时任务已${disabledVerb}（Schedule: ${result.scheduleId}）`;
}

function formatScheduleLines(schedule, staleNote = '') {
  if (!schedule?.configured && !schedule?.id) return [];
  return [
    '',
    `⏱ Apify 定时调度${staleNote}`,
    `Schedule：${schedule.id || config.apify.scheduleId}`,
    `状态：${schedule.isEnabled ? '✅ 运行中' : '⏸ 已暂停'}`,
    schedule.nextRunAt ? `下次运行：${formatTime(schedule.nextRunAt)}` : null,
  ].filter(Boolean);
}

function buildStatusMessage() {
  const duty = getDutyStatus();
  const lines = [
    '🤖 Upwork Robot 状态',
    '',
    duty.is_on_duty
      ? `👔 打卡：上班中（自 ${formatTime(duty.last_toggle_time)}）`
      : `🏖 打卡：已下班（自 ${formatTime(duty.last_toggle_time)}）`,
    `📡 模式：${useWebhookMode() ? 'Webhook（消息唤醒）' : 'Polling（本地）'}`,
  ];

  if (apify.isConfigured()) {
    const cached = apify.getScheduleCached();
    if (cached?.id) {
      const age = cached.cached_at ? formatTime(cached.cached_at) : '';
      lines.push(...formatScheduleLines(cached, age ? `（缓存 ${age}）` : ''));
    } else {
      lines.push('');
      lines.push('⏱ Apify：调度信息尚未缓存');
    }
  } else {
    lines.push('');
    lines.push('⚠️ Apify：未配置 APIFY_TOKEN');
  }

  lines.push(...buildWebhookStatsSection(getWebhookStats()));
  lines.push(...buildJobsOverviewSection(getJobsOverview()));
  const uptimeMin = Math.floor((Date.now() - startedAt) / 60000);
  lines.push('', `🟢 进程运行：${uptimeMin} 分钟`);
  return lines.join('\n');
}

function getNotifyChatId() {
  return config.telegram.chatId || getSetting('telegram_chat_id') || '';
}

function isAuthorizedChat(msgChatId) {
  const allowed = getNotifyChatId();
  if (!allowed) return true;
  return String(msgChatId) === String(allowed);
}

async function safeSend(telegramBot, chatId, text, options = {}) {
  const body = text.length > 3900 ? `${text.slice(0, 3900)}\n…(已截断)` : text;
  return Promise.race([
    telegramBot.sendMessage(chatId, body, options),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Telegram 发送超时')), 12000);
    }),
  ]);
}

function getBot() {
  if (!config.telegram.token) return null;
  if (!bot) {
    bot = new TelegramBot(config.telegram.token, {
      polling: !useWebhookMode(),
    });

    if (!useWebhookMode()) {
      bot.on('polling_error', (err) => {
        console.error('[telegram] polling_error:', err.message);
      });
    }

    registerCommands(bot);
    touchBotAlive();

    if (apify.isConfigured()) {
      setImmediate(() => apify.refreshScheduleCache().catch(() => {}));
    }
  }
  return bot;
}

function registerCommands(telegramBot) {
  if (commandsRegistered) return;
  commandsRegistered = true;

  telegramBot.onText(/\/ping/, async (msg) => {
    if (!isAuthorizedChat(msg.chat.id)) return;
    touchBotAlive();
    try {
      await safeSend(
        telegramBot,
        msg.chat.id,
        `🏓 pong\n运行 ${Math.floor((Date.now() - startedAt) / 1000)}s\n${new Date().toISOString()}`
      );
    } catch (err) {
      console.error('[telegram] /ping:', err.message);
    }
  });

  telegramBot.onText(/\/start/, async (msg) => {
    if (!isAuthorizedChat(msg.chat.id)) return;
    touchBotAlive();
    const id = String(msg.chat.id);
    if (!config.telegram.chatId) setSetting('telegram_chat_id', id);
    try {
      await safeSend(
        telegramBot,
        msg.chat.id,
        `Upwork Robot 已连接。\nChat ID: ${id}\n\n/ping 测活 · /checkin · /checkout · /status`
      );
    } catch (err) {
      console.error('[telegram] /start:', err.message);
    }
  });

  telegramBot.onText(/\/checkin/, async (msg) => {
    if (!isAuthorizedChat(msg.chat.id)) return;
    touchBotAlive();
    setDutyStatus(true);
    try {
      await safeSend(telegramBot, msg.chat.id, '✅ 上班打卡成功！正在监控项目。');
    } catch (err) {
      console.error('[telegram] /checkin:', err.message);
    }

    if (!apify.isConfigured()) return;
    setImmediate(async () => {
      try {
        const r = await apify.resumeSchedule();
        await safeSend(telegramBot, msg.chat.id, `🔄 Apify${apifyLine(r, '启用', '暂停')}`);
      } catch (err) {
        await safeSend(telegramBot, msg.chat.id, `⚠️ Apify：${err.message}`).catch(() => {});
      }
    });
  });

  telegramBot.onText(/\/checkout/, async (msg) => {
    if (!isAuthorizedChat(msg.chat.id)) return;
    touchBotAlive();
    setDutyStatus(false);
    try {
      await safeSend(telegramBot, msg.chat.id, '✅ 下班打卡成功！已暂停推送。');
    } catch (err) {
      console.error('[telegram] /checkout:', err.message);
    }

    if (!apify.isConfigured()) return;
    setImmediate(async () => {
      try {
        const r = await apify.pauseSchedule();
        await safeSend(telegramBot, msg.chat.id, `🔄 Apify${apifyLine(r, '启用', '暂停')}`);
      } catch (err) {
        await safeSend(telegramBot, msg.chat.id, `⚠️ Apify：${err.message}`).catch(() => {});
      }
    });
  });

  telegramBot.onText(/\/status/, async (msg) => {
    if (!isAuthorizedChat(msg.chat.id)) return;
    touchBotAlive();
    try {
      await safeSend(telegramBot, msg.chat.id, buildStatusMessage());
    } catch (err) {
      console.error('[telegram] /status:', err.message);
      try {
        await safeSend(telegramBot, msg.chat.id, `❌ 状态生成失败：${err.message}`);
      } catch (_) {
        /* ignore */
      }
    }
    if (apify.isConfigured()) {
      setImmediate(() => apify.refreshScheduleCache().catch(() => {}));
    }
  });

  telegramBot.on('callback_query', async (query) => {
    const data = query.data || '';
    if (!data.startsWith('copy:')) return;
    touchBotAlive();
    const jobId = data.slice(5);
    const job = getJob(jobId);
    const letter = job?.cover_letter_full;
    try {
      await telegramBot.answerCallbackQuery(query.id, {
        text: letter ? '完整提案已发送' : '未找到提案',
        show_alert: !letter,
      });
      if (letter) {
        await safeSend(
          query.message.chat.id,
          `📋 完整 AI 提案 (${jobId}):\n\n${letter}`
        );
      }
    } catch (err) {
      console.error('[telegram] callback:', err.message);
    }
  });
}

function verifyTelegramWebhookSecret(req) {
  const secret = config.telegram.webhookSecret;
  if (!secret) return true;
  return req.get('X-Telegram-Bot-Api-Secret-Token') === secret;
}

function handleTelegramWebhook(update) {
  const telegramBot = getBot();
  if (!telegramBot || !update) return;
  touchBotAlive();
  telegramBot.processUpdate(update);
}

async function registerTelegramWebhook() {
  const telegramBot = getBot();
  if (!telegramBot) return;

  const url = getWebhookUrl();
  const options = {};
  if (config.telegram.webhookSecret) {
    options.secret_token = config.telegram.webhookSecret;
  }

  await telegramBot.deleteWebHook({ drop_pending_updates: false });
  await telegramBot.setWebHook(url, options);
  console.log(`[telegram] Webhook registered: ${url}`);
  setSetting('telegram_webhook_url', url);
}

async function sendJobAlert(job, evaluation) {
  const telegramBot = getBot();
  const notifyChatId = getNotifyChatId();
  if (!telegramBot || !notifyChatId) return;

  const text = buildJobMessage(job, evaluation);
  const applyUrl = buildApplyUrl(job.job_id, config.baseUrl);

  await safeSend(telegramBot, notifyChatId, text, {
    parse_mode: 'MarkdownV2',
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔗 直达 Upwork 投递页', url: applyUrl }],
        [{ text: '📋 复制完整 AI 提案', callback_data: `copy:${job.job_id}` }],
      ],
    },
  });
}

async function startTelegram() {
  if (!config.telegram.token) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN not set');
    return;
  }

  getBot();

  if (useWebhookMode()) {
    try {
      await registerTelegramWebhook();
    } catch (err) {
      console.error('[telegram] setWebHook failed:', err.message);
    }
    return;
  }

  console.log('[telegram] Polling mode (local dev)');
}

module.exports = {
  getBot,
  sendJobAlert,
  startTelegram,
  handleTelegramWebhook,
  verifyTelegramWebhookSecret,
  useWebhookMode,
};
