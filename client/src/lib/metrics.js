// Metric + status presentation helpers shared by Dashboard and ThesisDetail.

// §3: the only metrics the evaluator understands. Stored as the lowercase key.
export const METRIC_OPTIONS = [
  { value: 'pe_ratio', label: 'P/E Ratio' },
  { value: 'revenue_growth', label: 'Revenue Growth (%)' },
  { value: 'profit_margin', label: 'Profit Margin (%)' },
];

const METRIC_LABELS = Object.fromEntries(METRIC_OPTIONS.map((o) => [o.value, o.label]));

export function metricLabel(name) {
  return METRIC_LABELS[name] || name;
}

// Metrics where a *lower* value beats the target (mirrors the evaluator's
// LOWER_IS_BETTER). Used to show the ≤/≥ goal direction next to a target.
export const LOWER_IS_BETTER = new Set(['pe_ratio']);

export function targetComparator(name) {
  return LOWER_IS_BETTER.has(name) ? '≤' : '≥';
}

// Revenue growth and profit margin are trailing-twelve-month figures that only
// change when the company reports earnings (~every 91 days). A shorter window
// usually contains no report, so the outcome would be fixed the moment it was
// set. Mirrors public.min_deadline_days() in 20260926_thesis_integrity_locks.sql.
export const EARNINGS_METRICS = new Set(['revenue_growth', 'profit_margin']);
export const MIN_DEADLINE_DAYS = 30;
export const MIN_EARNINGS_DEADLINE_DAYS = 90;

/** Minimum days from creation to deadline for a thesis with these metrics. */
export function minDeadlineDays(metricNames = []) {
  return metricNames.some((n) => EARNINGS_METRICS.has(n))
    ? MIN_EARNINGS_DEADLINE_DAYS
    : MIN_DEADLINE_DAYS;
}

export function getStatusColor(status) {
  if (status === 'On Track') return 'bg-green-500/10 text-green-400';
  if (status === 'Watch') return 'bg-yellow-500/10 text-yellow-400';
  if (status === 'Broken') return 'bg-red-500/10 text-red-400';
  return 'bg-gray-500/10 text-gray-400';
}

// Render a row's freshness timestamp only if the column actually exists
// (schema-defensive — see docs/DECISIONS.md on last_updated).
export function freshness(row) {
  const ts = row?.last_updated || row?.updated_at || null;
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString();
}
