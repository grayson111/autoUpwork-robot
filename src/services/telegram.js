const TelegramBot = require('node-telegram-bot-api');
const config = require('../config');
const { getDutyStatus, setDutyStatus, getJob, getSetting, setSetting } = require('../db/sqlite');
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

async function toggleDutyWithApify(onDuty) {
  setDutyStatus(onDuty);
  try {
    const apifyResult = onDuty ? await apify.resumeSchedule() : await apify.pauseSchedule();
    return { apifyResult, apifyError: null };
  } catch (err) {
    console.error('[apify]', err.message);
    return { apifyResult: null, apifyError: err.message };
  }
}

let bot = null;

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
    bot = new TelegramBot(config.telegram.token, { polling: true });
    registerCommands(bot);
  }
  return bot;
}

function registerCommands(telegramBot) {
  telegramBot.onText(/\/start/, async (msg) => {
    const id = String(msg.chat.id);
    if (!config.telegram.chatId) {
      setSetting('telegram_chat_id', id);
    }
    await telegramBot.sendMessage(
      msg.chat.id,
      `Upwork Robot 已连接。\n你的 Chat ID: \`${id}\`\n\n命令：\n/checkin 上班\n/checkout 下班\n/status 状态`,
      { parse_mode: 'Markdown' }
    );
  });

  telegramBot.onText(/\/checkin/, async (msg) => {
    if (!isAuthorizedChat(msg.chat.id)) return;
    const { apifyResult, apifyError } = await toggleDutyWithApify(true);
    let text = '上班打卡成功！正在为您监控神仙项目。';
    if (apifyError) {
      text += `\n⚠️ Apify 启用失败：${apifyError}\n（本地已上班，请检查 APIFY_TOKEN）`;
    } else if (apifyResult) {
      text += apifyLine(apifyResult, '启用', '暂停');
    }
    await telegramBot.sendMessage(msg.chat.id, text);
  });

  telegramBot.onText(/\/checkout/, async (msg) => {
    if (!isAuthorizedChat(msg.chat.id)) return;
    const { apifyResult, apifyError } = await toggleDutyWithApify(false);
    let text = '下班打卡成功！已暂停消息推送，好好享受生活。';
    if (apifyError) {
      text += `\n⚠️ Apify 暂停失败：${apifyError}\n（本地已下班，请检查 APIFY_TOKEN）`;
    } else if (apifyResult) {
      text += apifyLine(apifyResult, '启用', '暂停');
    }
    await telegramBot.sendMessage(msg.chat.id, text);
  });

  telegramBot.onText(/\/status/, async (msg) => {
    if (!isAuthorizedChat(msg.chat.id)) return;
    const duty = getDutyStatus();
    const lines = [
      duty.is_on_duty
        ? `当前状态：上班中（自 ${duty.last_toggle_time}）`
        : `当前状态：已下班（自 ${duty.last_toggle_time}）`,
    ];

    if (apify.isConfigured()) {
      try {
        const schedule = await apify.getSchedule();
        if (schedule.configured) {
          lines.push(
            `Apify Schedule (${schedule.id}): ${schedule.isEnabled ? '运行中' : '已暂停'}`
          );
          if (schedule.nextRunAt) {
            lines.push(`下次运行：${schedule.nextRunAt}`);
          }
        }
      } catch (err) {
        lines.push(`Apify 状态查询失败：${err.message}`);
      }
    } else {
      lines.push('Apify：未配置远程调度（APIFY_TOKEN）');
    }

    await telegramBot.sendMessage(msg.chat.id, lines.join('\n'));
  });

  telegramBot.on('callback_query', async (query) => {
    const data = query.data || '';
    if (!data.startsWith('copy:')) return;
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
