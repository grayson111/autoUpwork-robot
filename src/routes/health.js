const express = require('express');
const { getDutyStatus, getSetting } = require('../db/sqlite');

const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({
    ok: true,
    duty: getDutyStatus(),
    bot_last_alive: getSetting('bot_last_alive') || null,
    uptime_sec: Math.floor(process.uptime()),
  });
});

module.exports = router;
