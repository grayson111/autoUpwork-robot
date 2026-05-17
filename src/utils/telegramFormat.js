/** Escape text for Telegram MarkdownV2 */
function escapeMd(text) {
  return String(text ?? '').replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

function scoreEmoji(score) {
  if (score >= 9) return '🔥';
  if (score >= 8) return '⭐';
  if (score >= 6) return '👀';
  return '⚠️';
}

function buildJobMessage(job, evaluation) {
  const score = Number(evaluation.score) || 0;
  const lines = [
    `${scoreEmoji(score)} *${escapeMd(job.title)}*`,
    '',
    `💰 *预算:* ${escapeMd(job.budget)}`,
    `📊 *竞争:* ${escapeMd(String(job.proposals_count))} proposals`,
    `🎯 *AI 匹配分:* ${escapeMd(score.toFixed(1))}/10`,
    '',
    `*事少:* ${escapeMd(evaluation.reason_low_effort || '—')}`,
    `*钱多:* ${escapeMd(evaluation.reason_high_pay || '—')}`,
  ];
  if (evaluation.cover_letter_preview) {
    lines.push('', `📝 *提案摘要:* ${escapeMd(evaluation.cover_letter_preview)}`);
  }
  return lines.join('\n');
}

function buildApplyUrl(jobId, baseUrl) {
  const params = new URLSearchParams({ ref: 'mybot', job_id: jobId });
  return `https://www.upwork.com/ab/proposals/job/${jobId}/apply/?${params.toString()}`;
}

module.exports = { escapeMd, buildJobMessage, buildApplyUrl };
