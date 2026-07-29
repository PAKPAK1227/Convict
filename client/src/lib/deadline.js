// Thesis resolution-deadline helpers. Pure functions (no I/O) so they're unit
// testable. A thesis "resolves" once its target_date has passed; at that point
// its verdict is final.

export const DEADLINE_PRESETS = [
  { value: '1M', label: '1 month', months: 1 },
  { value: '3M', label: '3 months', months: 3 },
  { value: '6M', label: '6 months', months: 6 },
  { value: '1Y', label: '1 year', months: 12 },
];

// Parse a yyyy-mm-dd string as a LOCAL date (new Date('yyyy-mm-dd') is UTC,
// which drifts a day in negative-offset timezones). Other inputs pass through.
const parseLocal = (d) => {
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day);
  }
  return new Date(d);
};

const toDateOnly = (d) => {
  const x = parseLocal(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

/** ISO yyyy-mm-dd for `months` from `from` (local date). */
export function addMonthsISO(months, from = new Date()) {
  const d = new Date(from);
  d.setMonth(d.getMonth() + months);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** ISO date for a preset value ('1M'|'3M'|'6M'|'1Y'), or '' if unknown. */
export function presetDateISO(value, from = new Date()) {
  const p = DEADLINE_PRESETS.find((x) => x.value === value);
  return p ? addMonthsISO(p.months, from) : '';
}

/** Whole days until targetDate: >0 future, 0 today, <0 past. null if invalid. */
export function daysUntil(targetDate, now = new Date()) {
  if (!targetDate) return null;
  const d = toDateOnly(targetDate);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((d - toDateOnly(now)) / 86400000);
}

function humanDays(n) {
  if (n < 30) return `${n} day${n === 1 ? '' : 's'}`;
  if (n < 365) {
    const mo = Math.round(n / 30);
    return `${mo} month${mo === 1 ? '' : 's'}`;
  }
  const y = Math.round((n / 365) * 10) / 10;
  return `${y} year${y === 1 ? '' : 's'}`;
}

/** { resolved, dueToday, label } for display, or null if no/invalid date. */
export function deadlineStatus(targetDate, now = new Date()) {
  const n = daysUntil(targetDate, now);
  if (n === null) return null;
  if (n < 0) return { resolved: true, dueToday: false, label: `Resolved ${humanDays(-n)} ago` };
  if (n === 0) return { resolved: false, dueToday: true, label: 'Resolves today' };
  return { resolved: false, dueToday: false, label: `Resolves in ${humanDays(n)}` };
}

/** Readable date for the create form, e.g. "Mar 24, 2026". */
export function formatDeadlineDate(iso) {
  if (!iso) return '';
  const d = parseLocal(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
