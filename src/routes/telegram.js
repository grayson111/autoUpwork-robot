const express = require('express');
const { handleTelegramWebhook, verifyTelegramWebhookSecret } = require('../services/telegram');

const router = express.Router();

router.post('/webhook', async (req, res) => {
  if (!verifyTelegramWebhookSecret(req)) {
    return res.status(403).json({ ok: false, error: 'Invalid telegram webhook secret' });
  }
  try {
    const { ensureTelegramActive } = require('../services/telegram');
    await ensureTelegramActive();
    handleTelegramWebhook(req.body);
  } catch (err) {
    console.error('[telegram] webhook handler:', err.message);
  }
  res.status(200).json({ ok: true });
});

module.exports = router;
