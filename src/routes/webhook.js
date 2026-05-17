const express = require('express');
const apify = require('../services/apify');
const { webhookAuth } = require('../middleware/webhookAuth');
const { runWebhookInBackground } = require('../services/webhookHandler');

const router = express.Router();

/** Apify health ping — optional GET to verify URL is reachable */
router.get('/upwork-jobs', (_req, res) => {
  res.status(200).json({ ok: true, endpoint: 'POST /api/webhook/upwork-jobs' });
});

router.post('/upwork-jobs', webhookAuth, (req, res) => {
  const body = req.body;

  if (apify.isActorRunWebhook(body)) {
    const runId = apify.extractActorRunId(body);
    runWebhookInBackground(body);
    return res.status(200).json({
      success: true,
      accepted: true,
      runId,
      message: 'Apify run acknowledged, processing in background',
    });
  }

  const hasDirectJobs =
    Array.isArray(body) ||
    Array.isArray(body?.items) ||
    Array.isArray(body?.jobs) ||
    Array.isArray(body?.data);

  if (hasDirectJobs) {
    runWebhookInBackground(body);
    return res.status(200).json({
      success: true,
      accepted: true,
      message: 'Job batch acknowledged, processing in background',
    });
  }

  console.warn('[webhook] unrecognized payload keys:', Object.keys(body || {}));
  return res.status(200).json({
    success: true,
    accepted: true,
    message: 'Payload acknowledged (unrecognized format, no retry needed)',
  });
});

module.exports = router;
