import {
  DEADLINE_PRESETS,
  addDaysISO,
  presetDateISO,
  minDeadlineISO,
  deadlineError,
  daysUntil,
  deadlineStatus,
  formatDeadlineDate,
} from '../deadline';

const NOW = new Date('2026-07-24T12:00:00');

describe('presets', () => {
  test('exposes 1M / 3M / 6M / 1Y', () => {
    expect(DEADLINE_PRESETS.map((p) => p.value)).toEqual(['1M', '3M', '6M', '1Y']);
  });

  test('presetDateISO returns a yyyy-mm-dd date in the future', () => {
    const iso = presetDateISO('3M', NOW);
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(daysUntil(iso, NOW)).toBeGreaterThan(80);
    expect(daysUntil(iso, NOW)).toBeLessThan(100);
  });

  test('presetDateISO is empty for an unknown preset', () => {
    expect(presetDateISO('nope', NOW)).toBe('');
  });

  test('presets are fixed day counts, so "1 month" is always 30 days', () => {
    expect(DEADLINE_PRESETS.map((p) => p.days)).toEqual([30, 90, 180, 365]);
    expect(presetDateISO('1M', new Date('2027-02-01T12:00:00Z'))).toBe('2027-03-03');
  });
});

describe('addDaysISO', () => {
  test('counts days from the UTC date, across month and year ends', () => {
    expect(addDaysISO(30, new Date('2026-07-24T12:00:00Z'))).toBe('2026-08-23');
    expect(addDaysISO(10, new Date('2026-12-28T12:00:00Z'))).toBe('2027-01-07');
  });

  test('uses the UTC day even late in the evening in the Americas', () => {
    // 23:30 in New York on Jul 24 is already Jul 25 in UTC.
    expect(addDaysISO(0, new Date('2026-07-25T03:30:00Z'))).toBe('2026-07-25');
  });
});

describe('minimum deadline', () => {
  const FROM = new Date('2026-07-24T12:00:00Z');

  test('30 days for P/E, 90 once an earnings metric is involved', () => {
    expect(minDeadlineISO(['pe_ratio'], FROM)).toBe('2026-08-23');
    expect(minDeadlineISO([], FROM)).toBe('2026-08-23');
    expect(minDeadlineISO(['pe_ratio', 'profit_margin'], FROM)).toBe('2026-10-22');
    expect(minDeadlineISO(['revenue_growth'], FROM)).toBe('2026-10-22');
  });

  test('deadlineError accepts the minimum and rejects a day earlier', () => {
    expect(deadlineError('2026-08-23', ['pe_ratio'], FROM)).toBe('');
    expect(deadlineError('2026-08-22', ['pe_ratio'], FROM)).toMatch(/at least 30 days/);
    expect(deadlineError('2026-10-22', ['revenue_growth'], FROM)).toBe('');
    expect(deadlineError('2026-10-21', ['revenue_growth'], FROM)).toMatch(/earnings.*90 days/);
  });

  test('deadlineError requires a date', () => {
    expect(deadlineError('', ['pe_ratio'], FROM)).toMatch(/choose/i);
  });

  test('every preset except 1 month clears the earnings minimum', () => {
    const ok = DEADLINE_PRESETS.filter(
      (p) => deadlineError(presetDateISO(p.value, FROM), ['profit_margin'], FROM) === ''
    ).map((p) => p.value);
    expect(ok).toEqual(['3M', '6M', '1Y']);
  });
});

describe('daysUntil', () => {
  test('future / today / past', () => {
    expect(daysUntil('2026-07-31', NOW)).toBe(7);
    expect(daysUntil('2026-07-24', NOW)).toBe(0);
    expect(daysUntil('2026-07-14', NOW)).toBe(-10);
  });

  test('null for missing or invalid input', () => {
    expect(daysUntil(null, NOW)).toBeNull();
    expect(daysUntil('not-a-date', NOW)).toBeNull();
  });
});

describe('deadlineStatus', () => {
  test('a passed deadline is resolved', () => {
    const s = deadlineStatus('2026-07-14', NOW);
    expect(s.resolved).toBe(true);
    expect(s.label).toMatch(/^Resolved .* ago$/);
  });

  test('the deadline day itself is due today, not resolved', () => {
    const s = deadlineStatus('2026-07-24', NOW);
    expect(s.resolved).toBe(false);
    expect(s.dueToday).toBe(true);
    expect(s.label).toBe('Resolves today');
  });

  test('a future deadline is not resolved', () => {
    const s = deadlineStatus('2026-10-24', NOW);
    expect(s.resolved).toBe(false);
    expect(s.label).toMatch(/^Resolves in/);
  });

  test('null for no date', () => {
    expect(deadlineStatus(null, NOW)).toBeNull();
  });
});

describe('formatDeadlineDate', () => {
  test('formats an ISO date and tolerates junk', () => {
    expect(formatDeadlineDate('2026-03-24')).toMatch(/2026/);
    expect(formatDeadlineDate('')).toBe('');
    expect(formatDeadlineDate('bad')).toBe('');
  });
});
