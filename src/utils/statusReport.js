function formatTime(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
  } catch {
    return iso;
  }
}

function sourceLabel(source) {
  const map = {
    apify_dataset: 'Apify Dataset',
    payload: '直接推送',
    none: '无数据',
    error: '处理异常',
    unknown: '未知',
  };
  return map[source] || source || '未知';
}

function buildWebhookStatsSection(stats) {
  const lines = ['', '📥 最近数据接收'];
  const last = stats?.last;

  if (!last) {
    lines.push('尚无 Webhook 处理记录（等待 Apify Run succeeded）');
    return lines;
  }

  if (last.error) {
    lines.push(`时间：${formatTime(last.at)}`);
    lines.push(`状态：❌ 失败 — ${last.error}`);
    return lines;
  }

  if (last.duplicate) {
    lines.push(`时间：${formatTime(last.at)}`);
    lines.push(`状态：↩️ 重复 Run（已跳过）`);
    lines.push(`Run ID：${last.run_id || '—'}`);
    return lines;
  }

  lines.push(`时间：${formatTime(last.at)}`);
  lines.push(`来源：${sourceLabel(last.source)}`);
  if (last.run_id) lines.push(`Run ID：${last.run_id}`);
  lines.push(`Dataset 条数：${last.dataset_items ?? 0}`);
  lines.push(`解析任务数：${last.jobs_parsed ?? 0}`);
  lines.push(`硬性过滤：${last.jobs_filtered ?? 0}`);
  lines.push(`Telegram 推送：${last.jobs_notified ?? 0}`);
  if (last.jobs_skipped_duty > 0) {
    lines.push(`下班跳过：${last.jobs_skipped_duty}`);
  }
  if (last.jobs_errors > 0) {
    lines.push(`处理失败：${last.jobs_errors}`);
  }
  if (last.message) lines.push(`备注：${last.message}`);

  const t = stats.totals || {};
  lines.push('');
  lines.push('📊 累计统计');
  lines.push(`Webhook 次数：${t.webhooks ?? 0}`);
  lines.push(`成功处理 Run：${t.runs_processed ?? 0}`);
  lines.push(`累计 Dataset 条：${t.dataset_items ?? 0}`);
  lines.push(`累计推送：${t.jobs_notified ?? 0}`);

  const recent = stats.recent || [];
  if (recent.length > 1) {
    lines.push('');
    lines.push('🕐 近几次接收');
    recent.slice(0, 3).forEach((r, i) => {
      const tag = r.duplicate ? '重复' : r.error ? '失败' : `${r.dataset_items ?? 0}条→推${r.jobs_notified ?? 0}`;
      lines.push(`${i + 1}. ${formatTime(r.at)} · ${tag}`);
    });
  }

  return lines;
}

function buildJobsOverviewSection(overview) {
  return [
    '',
    '💾 本地缓存',
    `有效任务快照：${overview.cached} 条（7 天内）`,
    overview.notified_ready > 0
      ? `高分可投递：${overview.notified_ready} 条`
      : null,
    overview.avg_score != null ? `平均 AI 分：${overview.avg_score}/10` : null,
  ].filter(Boolean);
}

module.exports = {
  formatTime,
  buildWebhookStatsSection,
  buildJobsOverviewSection,
};
