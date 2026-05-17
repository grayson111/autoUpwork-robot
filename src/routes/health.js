const express = require('express');
const { getDutyStatus } = require('../db/sqlite');

const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({ ok: true, duty: getDutyStatus() });
});

module.exports = router;
