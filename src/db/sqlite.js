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
};
