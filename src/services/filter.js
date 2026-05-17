const config = require('../config');

function passesHardFilter(job) {
  const reasons = [];
  const { client, proposals_count: proposalsCount } = job;
  const { filter } = config;

  if (!client.isPaymentVerified) {
    reasons.push('client payment not verified');
  }

  if (client.rating > 0 && client.rating < filter.minClientRating) {
    reasons.push(`client rating ${client.rating} < ${filter.minClientRating}`);
  }

  if (client.totalSpent < filter.minClientSpent) {
    reasons.push(`client spent $${client.totalSpent} < $${filter.minClientSpent}`);
  }

  if (proposalsCount > filter.maxProposals) {
    reasons.push(`proposals ${proposalsCount} > ${filter.maxProposals}`);
  }

  return {
    pass: reasons.length === 0,
    reasons,
  };
}

module.exports = { passesHardFilter };
