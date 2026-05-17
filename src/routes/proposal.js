const express = require('express');
const { getJob } = require('../db/sqlite');

const router = express.Router();

router.get('/', (req, res) => {
  const jobId = req.query.job_id;
  if (!jobId) {
    return res.status(400).json({ success: false, error: 'job_id is required' });
  }

  const job = getJob(String(jobId));
  if (!job || !job.cover_letter_full) {
    return res.status(404).json({
      success: false,
      error: 'Proposal not found or expired',
    });
  }

  res.json({
    success: true,
    job_id: job.job_id,
    cover_letter: job.cover_letter_full,
  });
});

module.exports = router;
