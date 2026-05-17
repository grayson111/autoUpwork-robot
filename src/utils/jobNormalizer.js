/**
 * Normalize Apify / Upwork scraper payloads into a consistent shape.
 */
function parseMoney(value) {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  const str = String(value).replace(/[^0-9.]/g, '');
  const n = parseFloat(str);
  return Number.isFinite(n) ? n : 0;
}

function pick(obj, keys) {
  for (const key of keys) {
    const parts = key.split('.');
    let cur = obj;
    let found = true;
    for (const p of parts) {
      if (cur == null || typeof cur !== 'object') {
        found = false;
        break;
      }
      cur = cur[p];
    }
    if (found && cur != null && cur !== '') return cur;
  }
  return undefined;
}

function normalizeJob(raw) {
  const client =
    raw.client ||
    raw.buyer ||
    raw.employer ||
    raw.clientInfo ||
    {};

  const jobId = String(
    pick(raw, ['id', 'jobId', 'job_id', 'uid', 'ciphertext', 'jobUid']) || ''
  ).trim();

  const title = pick(raw, ['title', 'jobTitle', 'name']) || 'Untitled job';
  const description =
    pick(raw, ['description', 'jobDescription', 'snippet', 'summary']) || '';

  const skillsRaw = pick(raw, ['skills', 'tags', 'requiredSkills', 'ontologySkills']);
  const skills = Array.isArray(skillsRaw)
    ? skillsRaw.map((s) => (typeof s === 'string' ? s : s.name || s.prefLabel || '')).filter(Boolean)
    : [];

  const budgetObj = raw.budget || raw.amount || raw.jobBudget || {};
  const budget =
    pick(raw, ['budgetLabel', 'budget.label', 'formattedBudget']) ||
    budgetObj.label ||
    (budgetObj.min != null && budgetObj.max != null
      ? `$${budgetObj.min}-$${budgetObj.max}`
      : pick(raw, ['budget', 'hourlyBudget', 'fixedBudget']) || 'N/A');

  const proposalsCount = Number(
    pick(raw, [
      'proposalsCount',
      'totalApplicants',
      'applicantsCount',
      'proposals',
      'stats.proposals',
    ]) ?? 0
  );

  const clientRating = parseMoney(
    pick(client, ['rating', 'stats.rating', 'feedbackScore', 'averageFeedback'])
  );

  const totalSpent = parseMoney(
    pick(client, [
      'totalSpent',
      'stats.totalSpent',
      'totalCharges',
      'amountSpent',
      'totalSpend',
    ])
  );

  const isPaymentVerified = Boolean(
    pick(client, [
      'isPaymentVerified',
      'paymentVerified',
      'is_verified_payment',
      'verifiedPayment',
    ]) ?? pick(raw, ['isPaymentVerified', 'paymentVerified'])
  );

  const url =
    pick(raw, ['url', 'jobUrl', 'link', 'applyUrl']) ||
    (jobId ? `https://www.upwork.com/jobs/~${jobId}` : '');

  return {
    job_id: jobId,
    title: String(title),
    description: String(description),
    skills,
    budget: String(budget),
    proposals_count: proposalsCount,
    client: {
      isPaymentVerified,
      rating: clientRating,
      totalSpent,
    },
    url,
    raw,
  };
}

function extractJobsFromPayload(body) {
  if (!body) return [];
  if (Array.isArray(body)) return body.map(normalizeJob).filter((j) => j.job_id);
  if (Array.isArray(body.items)) return body.items.map(normalizeJob).filter((j) => j.job_id);
  if (Array.isArray(body.jobs)) return body.jobs.map(normalizeJob).filter((j) => j.job_id);
  if (Array.isArray(body.data)) return body.data.map(normalizeJob).filter((j) => j.job_id);
  if (body.resource?.defaultDatasetId && Array.isArray(body.datasetItems)) {
    return body.datasetItems.map(normalizeJob).filter((j) => j.job_id);
  }
  const single = normalizeJob(body);
  return single.job_id ? [single] : [];
}

module.exports = { normalizeJob, extractJobsFromPayload, parseMoney };
