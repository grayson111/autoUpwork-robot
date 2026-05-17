const { extractJobsFromPayload } = require('../src/utils/jobNormalizer');
const { passesHardFilter } = require('../src/services/filter');
const { setDutyStatus } = require('../src/db/sqlite');

const sample = {
  id: 'test-job-001',
  title: 'Shopify theme customization',
  description: 'Need Figma to Shopify, clear scope, fixed deliverables.',
  budget: '$2,500',
  proposalsCount: 8,
  client: {
    isPaymentVerified: true,
    rating: 4.9,
    totalSpent: 125000,
  },
  skills: ['Shopify', 'React'],
};

const jobs = extractJobsFromPayload([sample]);
console.assert(jobs.length === 1, 'extract jobs');
console.assert(jobs[0].job_id === 'test-job-001', 'job id');

const filter = passesHardFilter(jobs[0]);
console.assert(filter.pass, `hard filter: ${filter.reasons}`);

setDutyStatus(true);
console.log('smoke test passed');
