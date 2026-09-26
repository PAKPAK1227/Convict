// Thesis resolution-deadline helpers. Pure functions (no I/O) so they're unit
// testable. A thesis "resolves" once its target_date has passed; at that point
// its verdict is final.

import { minDeadlineDays, MIN_EARNINGS_DEADLINE_DAYS } from './metrics';

// Presets are fixed day counts, not calendar months: the minimum deadline is a
// flat 30 days (see minDeadlineDays), and "one month" from Feb 1 is only 28.
export const DEADLINE_PRESETS = [
  { value: '1M', label: '1 month', days: 30 },
  { value: '3M', label: '3 months', days: 90 },
  { value: '6M', label: '6 months', days: 180 },
  { value: '1Y', label: '1 year', days: 365 },
];

const DAY_MS = 86400000;

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

/**
 * ISO yyyy-mm-dd for `days` after `from`'s UTC date. UTC on purpose: the
 * database checks the minimum deadline against the UTC creation date, and the
 * evaluator resolves on UTC days, so the form must count the same way.
 */
export function addDaysISO(days, from = new Date()) {
  const base = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  return new Date(base + days * DAY_MS).toISOString().slice(0, 10);
}

/** ISO date for a preset value ('1M'|'3M'|'6M'|'1Y'), or '' if unknown. */
export function presetDateISO(value, from = new Date()) {
  const p = DEADLINE_PRESETS.find((x) => x.value === value);
  return p ? addDaysISO(p.days, from) : '';
}

/** Earliest allowed deadline for a new thesis with these metrics. */
export function minDeadlineISO(metricNames = [], from = new Date()) {
  return addDaysISO(minDeadlineDays(metricNames), from);
}

/** Why a deadline isn't allowed for these metrics, or '' if it is. */
export function deadlineError(targetDate, metricNames = [], from = new Date()) {
  if (!targetDate) return 'Choose a resolution deadline.';
  // yyyy-mm-dd strings compare correctly as plain strings.
  if (targetDate >= minDeadlineISO(metricNames, from)) return '';
  const days = minDeadlineDays(metricNames);
  return days === MIN_EARNINGS_DEADLINE_DAYS
    ? `Revenue growth and profit margin only change when the company reports earnings, so the deadline must be at least ${days} days out.`
    : `The deadline must be at least ${days} days out.`;
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
