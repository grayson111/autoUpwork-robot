const config = require('../config');
const { getDutyStatus, saveJob } = require('../db/sqlite');
const { passesHardFilter } = require('./filter');
const { evaluateJob } = require('./llm');
const { sendJobAlert } = require('./telegram');
const { buildApplyUrl } = require('../utils/telegramFormat');

async function processJob(job) {
  const duty = getDutyStatus();
  if (!duty.is_on_duty) {
    return { job_id: job.job_id, status: 'skipped', reason: 'off_duty' };
  }

  const hard = passesHardFilter(job);
  if (!hard.pass) {
    return { job_id: job.job_id, status: 'filtered', reason: hard.reasons.join('; ') };
  }

  let evaluation;
  try {
    evaluation = await evaluateJob(job);
  } catch (err) {
    console.error(`[llm] job ${job.job_id}:`, err.message);
    return { job_id: job.job_id, status: 'error', reason: err.message };
  }

  const score = Number(evaluation.score) || 0;
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + config.jobTtlDays);

  saveJob({
    job_id: job.job_id,
    title: job.title,
    budget: job.budget,
    proposals_count: job.proposals_count,
    score,
    reason_low_effort: evaluation.reason_low_effort || '',
    reason_high_pay: evaluation.reason_high_pay || '',
    cover_letter_preview: evaluation.cover_letter_preview || '',
    cover_letter_full: evaluation.cover_letter_full || '',
    apply_url: buildApplyUrl(job.job_id, config.baseUrl),
    raw_json: JSON.stringify(job.raw),
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  });

  if (score < config.minScoreToNotify) {
    return {
      job_id: job.job_id,
      status: 'stored',
      score,
      reason: `score ${score} below threshold ${config.minScoreToNotify}`,
    };
  }

  try {
    await sendJobAlert(job, evaluation);
  } catch (err) {
    console.error(`[telegram] push job ${job.job_id}:`, err.message);
    return { job_id: job.job_id, status: 'notify_failed', score, reason: err.message };
  }

  return { job_id: job.job_id, status: 'notified', score };
}

async function processJobs(jobs) {
  const max = config.webhookMaxJobs || 15;
  const batch = jobs.slice(0, max);
  if (jobs.length > max) {
    console.warn(`[jobs] truncating ${jobs.length} jobs to ${max} per webhook`);
  }
  const results = [];
  for (const job of batch) {
    try {
      results.push(await processJob(job));
    } catch (err) {
      console.error(`[jobs] ${job.job_id}:`, err.message);
      results.push({ job_id: job.job_id, status: 'error', reason: err.message });
    }
  }
  if (jobs.length > max) {
    results.push({
      job_id: '_truncated',
      status: 'skipped',
      reason: `${jobs.length - max} jobs skipped (WEBHOOK_MAX_JOBS=${max})`,
    });
  }
  return results;
}

module.exports = { processJob, processJobs };
