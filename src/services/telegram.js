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
  ];

  if (apify.isConfigured()) {
    const cached = apify.getScheduleCached();
    if (cached?.id) {
      const age = cached.cached_at ? formatTime(cached.cached_at) : '';
      lines.push(...formatScheduleLines(cached, age ? `（缓存 ${age}）` : ''));
    } else {
      lines.push('');
      lines.push('⏱ Apify：使用 /status 后后台同步调度信息');
    }
  } else {
    lines.push('');
    lines.push('⚠️ Apify：未配置 APIFY_TOKEN');
  }

  lines.push(...buildWebhookStatsSection(getWebhookStats()));
  lines.push(...buildJobsOverviewSection(getJobsOverview()));
  return lines.join('\n');
}

let bot = null;
const chatLocks = new Map();

function withChatLock(chatId, fn) {
  const prev = chatLocks.get(chatId) || Promise.resolve();
  const next = prev.then(fn).catch((err) => {
    console.error('[telegram] command error:', err.message);
  });
  chatLocks.set(
    chatId,
    next.finally(() => {
      if (chatLocks.get(chatId) === next) chatLocks.delete(chatId);
    })
  );
  return next;
}

function getNotifyChatId() {
  return config.telegram.chatId || getSetting('telegram_chat_id') || '';
}

function isAuthorizedChat(msgChatId) {
  const allowed = getNotifyChatId();
  if (!allowed) return true;
  return String(msgChatId) === String(allowed);
}

function getBot() {
  if (!config.telegram.token) return null;
  if (!bot) {
    bot = new TelegramBot(config.telegram.token, {
      polling: {
        interval: 1000,
        autoStart: true,
        params: { timeout: 10 },
      },
    });
    registerCommands(bot);
    if (apify.isConfigured()) {
      setImmediate(() => apify.refreshScheduleCache().catch(() => {}));
    }
  }
  return bot;
}

function registerCommands(telegramBot) {
  telegramBot.onText(/\/start/, (msg) => {
    if (!isAuthorizedChat(msg.chat.id)) return;
    withChatLock(msg.chat.id, async () => {
      const id = String(msg.chat.id);
      if (!config.telegram.chatId) setSetting('telegram_chat_id', id);
      await telegramBot.sendMessage(
        msg.chat.id,
        `Upwork Robot 已连接。\n你的 Chat ID: \`${id}\`\n\n/checkin 上班 · /checkout 下班 · /status 状态`,
        { parse_mode: 'Markdown' }
      );
    });
  });

  telegramBot.onText(/\/checkin/, (msg) => {
    if (!isAuthorizedChat(msg.chat.id)) return;
    withChatLock(msg.chat.id, async () => {
      setDutyStatus(true);
      await telegramBot.sendMessage(
        msg.chat.id,
        '✅ 上班打卡成功！正在为您监控项目。\n（Apify 调度同步中…）'
      );

      if (!apify.isConfigured()) {
        await telegramBot.sendMessage(
          msg.chat.id,
          '⚠️ 未配置 APIFY_TOKEN，仅更新本地打卡。'
        );
        return;
      }

      try {
        const apifyResult = await apify.resumeSchedule();
        await telegramBot.sendMessage(msg.chat.id, `🔄 Apify 同步完成${apifyLine(apifyResult, '启用', '暂停')}`);
      } catch (err) {
        await telegramBot.sendMessage(
          msg.chat.id,
          `⚠️ Apify 启用失败：${err.message}\n（本地已上班）`
        );
      }
    });
  });

  telegramBot.onText(/\/checkout/, (msg) => {
    if (!isAuthorizedChat(msg.chat.id)) return;
    withChatLock(msg.chat.id, async () => {
      setDutyStatus(false);
      await telegramBot.sendMessage(
        msg.chat.id,
        '✅ 下班打卡成功！已暂停消息推送。\n（Apify 调度同步中…）'
      );

      if (!apify.isConfigured()) {
        await telegramBot.sendMessage(
          msg.chat.id,
          '⚠️ 未配置 APIFY_TOKEN，仅更新本地打卡。'
        );
        return;
      }

      try {
        const apifyResult = await apify.pauseSchedule();
        await telegramBot.sendMessage(msg.chat.id, `🔄 Apify 同步完成${apifyLine(apifyResult, '启用', '暂停')}`);
      } catch (err) {
        await telegramBot.sendMessage(
          msg.chat.id,
          `⚠️ Apify 暂停失败：${err.message}\n（本地已下班）`
        );
      }
    });
  });

  telegramBot.onText(/\/status/, (msg) => {
    if (!isAuthorizedChat(msg.chat.id)) return;
    withChatLock(msg.chat.id, async () => {
      await telegramBot.sendMessage(msg.chat.id, buildStatusMessage());

      if (apify.isConfigured()) {
        setImmediate(() => {
          apify.refreshScheduleCache().catch(() => {});
        });
      }
    });
  });

  telegramBot.on('callback_query', (query) => {
    const data = query.data || '';
    if (!data.startsWith('copy:')) return;
    withChatLock(query.message.chat.id, async () => {
      const jobId = data.slice(5);
      const job = getJob(jobId);
      const letter = job?.cover_letter_full;
      await telegramBot.answerCallbackQuery(query.id, {
        text: letter ? '完整提案已发送到聊天' : '未找到提案',
        show_alert: !letter,
      });
      if (letter) {
        await telegramBot.sendMessage(
          query.message.chat.id,
          `📋 完整 AI 提案 (${jobId}):\n\n${letter}`
        );
      }
    });
  });
}

async function sendJobAlert(job, evaluation) {
  const telegramBot = getBot();
  const notifyChatId = getNotifyChatId();
  if (!telegramBot || !notifyChatId) {
    console.warn('[telegram] Bot token or chat id missing, skip push (send /start to bot first)');
    return;
  }

  const text = buildJobMessage(job, evaluation);
  const applyUrl = buildApplyUrl(job.job_id, config.baseUrl);

  await telegramBot.sendMessage(notifyChatId, text, {
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

function startTelegram() {
  if (!config.telegram.token) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN not set, polling disabled');
    return;
  }
  getBot();
  console.log('[telegram] Bot polling started');
}

module.exports = { getBot, sendJobAlert, startTelegram };
