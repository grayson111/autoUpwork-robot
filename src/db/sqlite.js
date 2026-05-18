/**
 * JSON file storage (no native modules — works on Hostinger shared Node hosting).
 */
const fs = require('fs');
const path = require('path');

const dataDir = process.env.DATA_DIR || path.join(__dirname, '../../data');
const storePath = path.join(dataDir, 'store.json');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const defaultStore = () => ({
  duty: {
    is_on_duty: false,
    last_toggle_time: new Date().toISOString(),
  },
  settings: {},
  jobs: {},
  processed_runs: {},
  webhook_stats: {
    last: null,
    totals: {
      webhooks: 0,
      runs_processed: 0,
      dataset_items: 0,
      jobs_evaluated: 0,
      jobs_notified: 0,
      jobs_filtered: 0,
    },
    recent: [],
  },
});

function readStore() {
  try {
    if (!fs.existsSync(storePath)) return defaultStore();
    const raw = fs.readFileSync(storePath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      ...defaultStore(),
      ...parsed,
      duty: { ...defaultStore().duty, ...parsed.duty },
      settings: parsed.settings || {},
      jobs: parsed.jobs || {},
      processed_runs: parsed.processed_runs || {},
      webhook_stats: {
        ...defaultStore().webhook_stats,
        ...(parsed.webhook_stats || {}),
        totals: {
          ...defaultStore().webhook_stats.totals,
          ...(parsed.webhook_stats?.totals || {}),
        },
        recent: parsed.webhook_stats?.recent || [],
      },
    };
  } catch {
    return defaultStore();
  }
}

function writeStore(store) {
  const tmp = `${storePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tmp, storePath);
}

function getDutyStatus() {
  const { duty } = readStore();
  return {
    is_on_duty: Boolean(duty.is_on_duty),
    last_toggle_time: duty.last_toggle_time,
  };
}

function setDutyStatus(isOnDuty) {
  const store = readStore();
  store.duty = {
    is_on_duty: Boolean(isOnDuty),
    last_toggle_time: new Date().toISOString(),
  };
  writeStore(store);
  return getDutyStatus();
}

function purgeExpiredJobs() {
  const store = readStore();
  const now = new Date().toISOString();
  let removed = 0;
  for (const [id, job] of Object.entries(store.jobs)) {
    if (job.expires_at && job.expires_at < now) {
      delete store.jobs[id];
      removed += 1;
    }
  }
  if (removed > 0) writeStore(store);
  return removed;
}

function saveJob(record) {
  purgeExpiredJobs();
  const store = readStore();
  store.jobs[record.job_id] = { ...record };
  writeStore(store);
}

function getJob(jobId) {
  purgeExpiredJobs();
  const store = readStore();
  return store.jobs[jobId] || null;
}

function getSetting(key) {
  const store = readStore();
  return store.settings[key] || '';
}

function setSetting(key, value) {
  const store = readStore();
  store.settings[key] = String(value);
  writeStore(store);
}

function isRunProcessed(runId) {
  const store = readStore();
  return Boolean(store.processed_runs?.[runId]);
}

function getJobsOverview() {
  purgeExpiredJobs();
  const jobs = Object.values(readStore().jobs);
  return {
    cached: jobs.length,
    notified_ready: jobs.filter((j) => Number(j.score) >= 8 && j.cover_letter_full).length,
    avg_score:
      jobs.length > 0
        ? (jobs.reduce((s, j) => s + (Number(j.score) || 0), 0) / jobs.length).toFixed(1)
        : null,
  };
}

function recordWebhookStats(summary) {
  const store = readStore();
  if (!store.webhook_stats) store.webhook_stats = defaultStore().webhook_stats;

  const entry = {
    at: new Date().toISOString(),
    run_id: summary.runId || null,
    source: summary.source || 'unknown',
    duplicate: Boolean(summary.skipped && summary.reason === 'duplicate_run'),
    error: summary.error || null,
    dataset_items: summary.itemCount ?? summary.dataset_items ?? 0,
    jobs_parsed: summary.total ?? 0,
    jobs_notified: summary.notified ?? 0,
    jobs_filtered: summary.filtered ?? 0,
    jobs_skipped_duty: summary.skipped_jobs ?? 0,
    jobs_errors: summary.errors ?? 0,
    message: summary.message || null,
  };

  store.webhook_stats.last = entry;
  const t = store.webhook_stats.totals;
  t.webhooks = (t.webhooks || 0) + 1;
  if (!entry.duplicate && !entry.error) {
    t.runs_processed = (t.runs_processed || 0) + 1;
    t.dataset_items = (t.dataset_items || 0) + entry.dataset_items;
    t.jobs_evaluated = (t.jobs_evaluated || 0) + entry.jobs_parsed;
    t.jobs_notified = (t.jobs_notified || 0) + entry.jobs_notified;
    t.jobs_filtered = (t.jobs_filtered || 0) + entry.jobs_filtered;
  }
  store.webhook_stats.recent = [entry, ...(store.webhook_stats.recent || [])].slice(0, 5);
  writeStore(store);
  return entry;
}

function getWebhookStats() {
  const store = readStore();
  return store.webhook_stats || defaultStore().webhook_stats;
}

function markRunProcessed(runId) {
  const store = readStore();
  if (!store.processed_runs) store.processed_runs = {};
  store.processed_runs[runId] = new Date().toISOString();
  const ids = Object.keys(store.processed_runs);
  if (ids.length > 200) {
    const sorted = ids.sort(
      (a, b) => new Date(store.processed_runs[b]) - new Date(store.processed_runs[a])
    );
    sorted.slice(100).forEach((id) => delete store.processed_runs[id]);
  }
  writeStore(store);
}

module.exports = {
  getDutyStatus,
  setDutyStatus,
  saveJob,
  getJob,
  getSetting,
  setSetting,
  purgeExpiredJobs,
  isRunProcessed,
  markRunProcessed,
  getJobsOverview,
  recordWebhookStats,
  getWebhookStats,
};
