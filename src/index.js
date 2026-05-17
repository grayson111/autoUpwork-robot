const express = require('express');
const cors = require('cors');
const config = require('./config');
const { startTelegram } = require('./services/telegram');
const { purgeExpiredJobs } = require('./db/sqlite');
const webhookRouter = require('./routes/webhook');
const proposalRouter = require('./routes/proposal');
const healthRouter = require('./routes/health');

const app = express();

app.use(
  cors({
    origin: ['https://www.upwork.com', 'https://upwork.com'],
    methods: ['GET', 'OPTIONS'],
  })
);

app.use(express.json({ limit: '2mb' }));

app.use(healthRouter);
app.use('/api/webhook', webhookRouter);
app.use('/api/proposal', proposalRouter);

app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

app.use((err, _req, res, _next) => {
  console.error('[server]', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

purgeExpiredJobs();
startTelegram();

app.listen(config.port, () => {
  console.log(`Upwork Robot listening on port ${config.port}`);
  console.log(`Base URL: ${config.baseUrl}`);
});
