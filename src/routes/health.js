const express = require('express');
const { getDutyStatus, getSetting } = require('../db/sqlite');
const {
  ensureTelegramActive,
  getTelegramDiagnostics,
  getTransportMode,
} = require('../services/telegram');

const router = express.Router();

router.get('/health', async (_req, res) => {
  const telegramReady = await ensureTelegramActive().catch((err) => ({
    ok: false,
    error: err.message,
  }));
  const telegram = await getTelegramDiagnostics().catch((err) => ({
    error: err.message,
  }));

  res.json({
    ok: true,
    duty: getDutyStatus(),
    bot_last_alive: getSetting('bot_last_alive') || null,
    telegram_mode: getTransportMode(),
    telegram_webhook: getSetting('telegram_webhook_url') || null,
    telegram_ready: telegramReady,
    telegram,
    uptime_sec: Math.floor(process.uptime()),
  });
});

module.exports = router;
