const express = require('express');
const { extractJobsFromPayload } = require('../utils/jobNormalizer');
const { processJobs } = require('../services/jobProcessor');
const { webhookAuth } = require('../middleware/webhookAuth');

const router = express.Router();

router.post('/upwork-jobs', webhookAuth, async (req, res) => {
  try {
    const jobs = extractJobsFromPayload(req.body);
    if (jobs.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid jobs in payload (need id/jobId field)',
      });
    }

    const results = await processJobs(jobs);
    const summary = {
      total: results.length,
      notified: results.filter((r) => r.status === 'notified').length,
      filtered: results.filter((r) => r.status === 'filtered').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
    };

    res.json({ success: true, summary, results });
  } catch (err) {
    console.error('[webhook]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
