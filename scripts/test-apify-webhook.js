const apify = require('../src/services/apify');

const sample = {
  eventType: 'ACTOR.RUN.SUCCEEDED',
  eventData: {
    actorId: 'XYTgoO05GT5qAoSlyx',
    actorRunId: process.argv[2] || 'test-run-id',
  },
  resource: { id: process.argv[2] || 'test-run-id' },
};

console.log('isActorRunWebhook:', apify.isActorRunWebhook(sample));
console.log('runId:', apify.extractActorRunId(sample));

if (process.argv[2] && process.env.APIFY_TOKEN) {
  apify
    .fetchRunDatasetItems(process.argv[2])
    .then((items) => console.log('dataset items:', items.length))
    .catch((e) => console.error(e.message));
}
