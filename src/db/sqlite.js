const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../config');

const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'upwork.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS duty_status (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    is_on_duty INTEGER NOT NULL DEFAULT 0,
    last_toggle_time TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS jobs (
    job_id TEXT PRIMARY KEY,
    title TEXT,
    budget TEXT,
    proposals_count INTEGER,
    score REAL,
    reason_low_effort TEXT,
    reason_high_pay TEXT,
    cover_letter_preview TEXT,
    cover_letter_full TEXT,
    apply_url TEXT,
    raw_json TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_jobs_expires ON jobs(expires_at);

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

const initDuty = db.prepare(`
  INSERT OR IGNORE INTO duty_status (id, is_on_duty, last_toggle_time)
  VALUES (1, 0, ?)
`);

initDuty.run(new Date().toISOString());

function getDutyStatus() {
  const row = db.prepare('SELECT is_on_duty, last_toggle_time FROM duty_status WHERE id = 1').get();
  return {
    is_on_duty: Boolean(row.is_on_duty),
    last_toggle_time: row.last_toggle_time,
  };
}

function setDutyStatus(isOnDuty) {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE duty_status SET is_on_duty = ?, last_toggle_time = ? WHERE id = 1
  `).run(isOnDuty ? 1 : 0, now);
  return getDutyStatus();
}

function purgeExpiredJobs() {
  const now = new Date().toISOString();
  return db.prepare('DELETE FROM jobs WHERE expires_at < ?').run(now).changes;
}

function saveJob(record) {
  purgeExpiredJobs();
  db.prepare(`
    INSERT INTO jobs (
      job_id, title, budget, proposals_count, score,
      reason_low_effort, reason_high_pay,
      cover_letter_preview, cover_letter_full, apply_url, raw_json,
      created_at, expires_at
    ) VALUES (
      @job_id, @title, @budget, @proposals_count, @score,
      @reason_low_effort, @reason_high_pay,
      @cover_letter_preview, @cover_letter_full, @apply_url, @raw_json,
      @created_at, @expires_at
    )
    ON CONFLICT(job_id) DO UPDATE SET
      title = excluded.title,
      budget = excluded.budget,
      proposals_count = excluded.proposals_count,
      score = excluded.score,
      reason_low_effort = excluded.reason_low_effort,
      reason_high_pay = excluded.reason_high_pay,
      cover_letter_preview = excluded.cover_letter_preview,
      cover_letter_full = excluded.cover_letter_full,
      apply_url = excluded.apply_url,
      raw_json = excluded.raw_json,
      expires_at = excluded.expires_at
  `).run(record);
}

function getJob(jobId) {
  purgeExpiredJobs();
  return db.prepare('SELECT * FROM jobs WHERE job_id = ?').get(jobId);
}

function getSetting(key) {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  return row?.value || '';
}

function setSetting(key, value) {
  db.prepare(`
    INSERT INTO app_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

module.exports = {
  db,
  getDutyStatus,
  setDutyStatus,
  saveJob,
  getJob,
  getSetting,
  setSetting,
  purgeExpiredJobs,
};
