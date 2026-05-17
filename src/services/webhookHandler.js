const { extractJobsFromPayload } = require('../utils/jobNormalizer');
const { processJobs } = require('./jobProcessor');
const apify = require('./apify');
const { isRunProcessed, markRunProcessed } = require('../db/sqlite');

async function resolveJobsFromBody(body) {
  let jobs = extractJobsFromPayload(body);
  if (jobs.length > 0) return { jobs, source: 'payload' };

  if (!apify.isActorRunWebhook(body)) {
    return { jobs: [], source: 'none' };
  }

  const runId = apify.extractActorRunId(body);
  if (!runId) return { jobs: [], source: 'apify_run', runId: null };

  const items = await apify.fetchRunDatasetItems(runId);
  jobs = extractJobsFromPayload(items);
  return { jobs, source: 'apify_dataset', runId, itemCount: items.length };
}

async function handleWebhookPayload(body) {
  const runId = apify.extractActorRunId(body);

  if (runId && isRunProcessed(runId)) {
    return {
      skipped: true,
      reason: 'duplicate_run',
      runId,
    };
  }

  if (runId) markRunProcessed(runId);

  const { jobs, source, itemCount } = await resolveJobsFromBody(body);

  if (jobs.length === 0) {
    return {
      skipped: false,
      source,
      runId,
      itemCount,
      total: 0,
      notified: 0,
      filtered: 0,
      message: 'acknowledged, no jobs to process',
    };
  }

  const results = await processJobs(jobs);
  return {
    skipped: false,
    source,
    runId,
    itemCount,
    total: results.length,
    notified: results.filter((r) => r.status === 'notified').length,
    filtered: results.filter((r) => r.status === 'filtered').length,
    skipped_jobs: results.filter((r) => r.status === 'skipped').length,
    results,
  };
}

function runWebhookInBackground(body) {
  setImmediate(() => {
    handleWebhookPayload(body)
      .then((summary) => console.log('[webhook] processed:', JSON.stringify(summary)))
      .catch((err) => console.error('[webhook] background error:', err.message));
  });
}

module.exports = { handleWebhookPayload, runWebhookInBackground, resolveJobsFromBody };
