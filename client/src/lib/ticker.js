// Ticker snapshot helpers for the create form's ticker panel. The data comes
// from public.ticker_snapshots, written nightly by refresh_snapshots.py — the
// browser never calls Finnhub. Pure functions (no I/O) so they're testable.

/**
 * Where `price` sits in its 52-week range, as 0–100, or null if the range is
 * missing or degenerate. Clamped: a new high/low since the range was computed
 * pins to the end rather than overflowing the bar.
 */
export function rangePosition(price, low, high) {
  const p = Number(price);
  const lo = Number(low);
  const hi = Number(high);
  if (price == null || low == null || high == null) return null;
  if ([p, lo, hi].some(Number.isNaN) || hi <= lo) return null;
  return Math.max(0, Math.min(100, ((p - lo) / (hi - lo)) * 100));
}

// Words the symbol list writes in caps that should stay that way.
const KEEP_UPPER = new Set(['ADR', 'ETF', 'REIT', 'LP', 'PLC', 'NV', 'SA', 'AG', 'SE', 'USA', 'US']);

/** "APPLE INC" -> "Apple Inc" (fallback for tickers without a profile name). */
export function titleCase(name) {
  return (name || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (KEEP_UPPER.has(w.toUpperCase()) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

/** Best display name for a snapshot row: the profile name, else the listing. */
export function snapshotName(row) {
  if (!row) return '';
  return row.company_name || titleCase(row.listed_name);
}

/**
 * Classify a lookup: 'found' (row exists), 'unknown' (no row, and the table
 * is populated so absence means the symbol isn't listed), or 'unavailable'
 * (the lookup failed or the table is empty — the nightly job may not have
 * run yet). Only 'unknown' should block creating a thesis; blocking on
 * 'unavailable' would lock everyone out whenever the job has a bad night.
 */
export function lookupState({ error, row, tableHasRows }) {
  if (error) return 'unavailable';
  if (row) return 'found';
  return tableHasRows ? 'unknown' : 'unavailable';
}

// Θ readings (see docs/DECISIONS.md, "Volatility framework"). 1.5 is the
// framework's own "directional" threshold; 0.6 mirrors it on the low side.
// Over one year a pure random walk lands below 0.6 about 15% of the time and
// above 1.5 about 13%, so these describe the past year; they aren't a forecast.
export const THETA_BANDS = [
  { max: 0.6, label: 'Range-bound', blurb: 'Moved a lot but went nowhere — choppy, mean-reverting.' },
  { max: 1.5, label: 'Random-walk-like', blurb: 'Wandered about as much as pure chance would.' },
  { max: Infinity, label: 'Directional', blurb: 'Spent its movement going somewhere — a trend.' },
];

/** The reading for a Θ value, or null if there isn't one. */
export function thetaReading(theta) {
  if (theta == null || Number.isNaN(Number(theta))) return null;
  return THETA_BANDS.find((b) => Number(theta) < b.max);
}

/** 0.2834 -> "28.3%". */
export function formatPercent(fraction, digits = 1) {
  if (fraction == null || Number.isNaN(Number(fraction))) return '—';
  return `${(Number(fraction) * 100).toFixed(digits)}%`;
}
