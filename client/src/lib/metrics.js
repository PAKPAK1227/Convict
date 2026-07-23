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
