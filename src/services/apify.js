const config = require('../config');

const API_BASE = 'https://api.apify.com/v2';

function isConfigured() {
  return Boolean(config.apify.token && config.apify.scheduleId);
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apify.token}`,
  };
}

async function parseApifyResponse(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      body?.error?.message ||
      body?.error?.type ||
      body?.message ||
      res.statusText ||
      'Unknown error';
    throw new Error(`Apify API ${res.status}: ${msg}`);
  }
  return body.data ?? body;
}

async function getSchedule() {
  if (!isConfigured()) {
    return { configured: false };
  }
  const url = `${API_BASE}/schedules/${encodeURIComponent(config.apify.scheduleId)}`;
  const res = await fetch(url, { method: 'GET', headers: authHeaders() });
  const data = await parseApifyResponse(res);
  return {
    configured: true,
    id: data.id,
    name: data.name,
    isEnabled: Boolean(data.isEnabled),
    nextRunAt: data.nextRunAt,
  };
}

async function setScheduleEnabled(isEnabled) {
  if (!isConfigured()) {
    return {
      ok: true,
      skipped: true,
      reason: 'APIFY_TOKEN or APIFY_SCHEDULE_ID not configured',
    };
  }

  const url = `${API_BASE}/schedules/${encodeURIComponent(config.apify.scheduleId)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ isEnabled }),
  });
  const data = await parseApifyResponse(res);

  return {
    ok: true,
    skipped: false,
    isEnabled: Boolean(data.isEnabled),
    scheduleId: data.id || config.apify.scheduleId,
    name: data.name,
  };
}

async function pauseSchedule() {
  return setScheduleEnabled(false);
}

async function resumeSchedule() {
  return setScheduleEnabled(true);
}

function hasApifyToken() {
  return Boolean(config.apify.token);
}

function extractActorRunId(body) {
  if (!body || typeof body !== 'object') return null;
  return (
    body.eventData?.actorRunId ||
    body.resource?.id ||
    body.actorRunId ||
    body.runId ||
    null
  );
}

function isActorRunWebhook(body) {
  if (!body || typeof body !== 'object') return false;
  const eventType = String(body.eventType || body.type || '').toUpperCase();
  if (eventType.includes('ACTOR.RUN.SUCCEEDED') || eventType.includes('RUN.SUCCEEDED')) {
    return Boolean(extractActorRunId(body));
  }
  return Boolean(extractActorRunId(body) && (body.resource || body.eventData));
}

async function fetchRunDatasetItems(actorRunId) {
  if (!hasApifyToken()) {
    throw new Error('APIFY_TOKEN is required to fetch run dataset');
  }
  const url = `${API_BASE}/actor-runs/${encodeURIComponent(actorRunId)}/dataset/items?format=json&clean=true&limit=1000`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${config.apify.token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Dataset fetch failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const payload = await res.json();
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

module.exports = {
  isConfigured,
  hasApifyToken,
  getSchedule,
  pauseSchedule,
  resumeSchedule,
  extractActorRunId,
  isActorRunWebhook,
  fetchRunDatasetItems,
};
