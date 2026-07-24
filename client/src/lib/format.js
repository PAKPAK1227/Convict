// Presentation formatting helpers (numbers, percentages, relative time).
// Pure formatting — no app data or backend behaviour.

const NUM = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

/** Thousands separators + trimmed decimals. Returns the raw value unchanged
 *  if it isn't a finite number (so "not tracked" placeholders pass through). */
export function formatNumber(v) {
  if (v == null || v === '') return v;
  const n = Number(v);
  return Number.isNaN(n) ? v : NUM.format(n);
}

/** Human relative time, e.g. "6h ago", "3 days ago". Null for bad input. */
export function relativeTime(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;

  const diffMs = Date.now() - d.getTime();
  if (Math.abs(diffMs) < 45 * 1000) return 'just now';

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const units = [
    ['year', 31536e6],
    ['month', 2592e6],
    ['week', 6048e5],
    ['day', 864e5],
    ['hour', 36e5],
    ['minute', 6e4],
  ];
  for (const [unit, ms] of units) {
    if (Math.abs(diffMs) >= ms || unit === 'minute') {
      return rtf.format(-Math.round(diffMs / ms), unit);
    }
  }
  return 'just now';
}

/** Schema-defensive freshness: picks whichever timestamp column exists and
 *  renders it as relative time. Mirrors metrics.freshness() column handling. */
export function freshnessRelative(row) {
  const ts = row?.last_updated || row?.updated_at || null;
  return relativeTime(ts);
}
