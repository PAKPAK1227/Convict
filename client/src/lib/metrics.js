// Metric + status presentation helpers shared by Dashboard and ThesisDetail.

// §3: the only metrics the evaluator understands. Stored as the lowercase key.
export const METRIC_OPTIONS = [
  { value: 'pe_ratio', label: 'P/E Ratio' },
  { value: 'revenue_growth', label: 'Revenue Growth (%)' },
  { value: 'profit_margin', label: 'Profit Margin (%)' },
  { value: 'price', label: 'Share Price ($)' },
];

// Price targets carry their own direction (fundamentals keep fixed ones).
// Mirrors evaluate_price() in data-service/evaluate_theses.py and the
// metrics_direction_valid CHECK.
export const PRICE = 'price';
export const PRICE_BAND = 0.05; // "within ±5%"
export const PRICE_DIRECTIONS = [
  { value: 'at_least', label: 'At least', blurb: 'closes at or above your price' },
  { value: 'at_most', label: 'At most', blurb: 'closes at or below it — a bet against the stock' },
  { value: 'within', label: 'Within ±5%', blurb: 'closes within 5% either side of it' },
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

/**
 * True when every target on a thesis was already satisfied when it was set, so
 * the call won't count toward the Convict Score. Mirrors counts_toward_score()
 * in the evaluator: a target not yet baselined (already_met null) gets the
 * benefit of the doubt, and one genuine target is enough for the call to count.
 */
export function allTargetsAlreadyMet(metrics = []) {
  return metrics.length > 0 && metrics.every((m) => m.already_met === true);
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

const money = (v) =>
  `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** A metric value for display: dollars for price, plain otherwise. */
export function formatValue(name, value) {
  if (value == null || value === '' || Number.isNaN(Number(value))) return '—';
  if (name === PRICE) return money(value);
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/** A target with its direction: "≥ 10", "≤ $200.00", "$200.00 ±5%". */
export function formatTarget({ metric_name: name, target_value: target, direction }) {
  if (name === PRICE) {
    if (direction === 'within') return `${money(target)} ±${PRICE_BAND * 100}%`;
    return `${direction === 'at_most' ? '≤' : '≥'} ${money(target)}`;
  }
  return `${targetComparator(name)} ${formatValue(name, target)}`;
}

/**
 * How far along a metric is toward its target, 0–100, or null without data.
 * At least / higher-is-better: current ÷ target. At most / lower-is-better:
 * target ÷ current. Within a band: 100 at the target, falling to 0 three
 * band-widths away (so the band's edge reads about two-thirds full).
 */
export function metricProgress({ metric_name: name, current_value: current, target_value: target, direction }) {
  const c = Number(current);
  const t = Number(target);
  if (current == null || target == null || Number.isNaN(c) || Number.isNaN(t) || t === 0) return null;
  const clamp = (x) => Math.max(0, Math.min(100, x));
  if (name === PRICE && direction === 'within') {
    return clamp(100 * (1 - Math.abs(c - t) / t / (3 * PRICE_BAND)));
  }
  const lowerWins = name === PRICE ? direction === 'at_most' : LOWER_IS_BETTER.has(name);
  if (lowerWins) return c <= 0 ? null : clamp((t / c) * 100);
  return clamp((c / t) * 100);
}

/** Why a draft target can't be saved, or '' if it can. */
export function targetError(name, direction, value) {
  if (!name) return 'Choose a metric.';
  if (value === '' || value == null || Number.isNaN(Number(value))) return 'Enter a numeric target value.';
  if (name === PRICE) {
    if (!PRICE_DIRECTIONS.some((d) => d.value === direction)) return 'Choose at least, at most, or within ±5%.';
    if (Number(value) <= 0) return 'A price target must be above $0.';
  }
  return '';
}

/** A price target's distance from today's close as a signed fraction (+0.087 = 8.7% above). */
export function distanceFromPrice(target, price) {
  const t = Number(target);
  const p = Number(price);
  if (!target || !price || Number.isNaN(t) || Number.isNaN(p) || p <= 0) return null;
  return t / p - 1;
}

/** "Adjusted for a 4:1 split" from a price target's cumulative split factor. */
export function splitNote(factor) {
  const f = Number(factor);
  if (!factor || Number.isNaN(f) || Math.abs(f - 1) < 1e-9) return null;
  const whole = (x) => Math.abs(x - Math.round(x)) < 1e-6;
  if (f < 1 && whole(1 / f)) return `Adjusted for a ${Math.round(1 / f)}:1 split`;
  if (f > 1 && whole(f)) return `Adjusted for a 1:${Math.round(f)} reverse split`;
  return 'Adjusted for stock splits';
}
